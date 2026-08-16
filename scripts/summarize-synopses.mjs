#!/usr/bin/env node
/**
 * Writes a two-to-three-sentence summary for each work that has a
 * recorded animatetimes synopsis.
 *
 *   node scripts/summarize-synopses.mjs              # dry run
 *   node scripts/summarize-synopses.mjs --apply      # merge into details/ja
 *   node scripts/summarize-synopses.mjs --only <id>
 *
 * The official synopsis is not stored. The model rewrites the premise in
 * this site's words so the work page has something a crawler can read
 * without reprinting Animate Times.
 *
 * Requires: gcloud auth application-default login, and grok on PATH.
 */

import { execFile } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { promisify } from 'util'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const run = promisify(execFile)

const ANIMES_PATH = 'versions/1/animes'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
const CACHE_DIR = '.cache/summaries'
const MODEL = 'grok-4.6'
const BATCH = 6
const TIMEOUT_MS = 10 * 60 * 1000
const apply = process.argv.includes('--apply')
const onlyIndex = process.argv.indexOf('--only')
const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1]

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['id', 'summary'],
      },
    },
  },
  required: ['items'],
})

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('='))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

initializeApp({
  credential: applicationDefault(),
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
})
const db = getFirestore()

const firstJsonObject = text => {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

/**
 * The first broadcast of a series, not the latest cour page.
 *
 * A database record is one series, but its workTagId is often the newest
 * season. The longest blurb is usually that season's recap. The work page
 * needs the premise, so we take the earliest cour that still has a synopsis.
 */
const loadSynopses = () => {
  const entries = []
  for (const file of readdirSync(WORKS_DIR).filter(name => name.endsWith('.yaml'))) {
    const cour = file.replace(/\.yaml$/, '')
    const doc = parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8'))
    for (const work of doc.works ?? []) {
      const synopsis = work.synopsis?.trim()
      if (!synopsis) continue
      entries.push({
        cour,
        synopsis,
        workTagId: work.workTagId ?? null,
        seriesTagId: work.seriesTagId ?? null,
      })
    }
  }
  entries.sort((a, b) => a.cour.localeCompare(b.cour))
  return entries
}

const synopsisFor = (entries, meta) => {
  const tags = new Set([meta.workTagId, meta.seriesTagId].filter(Boolean))
  if (!tags.size) return null
  const hit = entries.find(
    entry => tags.has(entry.workTagId) || tags.has(entry.seriesTagId)
  )
  return hit?.synopsis ?? null
}

const promptFor = batch => `異世界アニメまとめサイト「いせかいぷらす」の作品ページ用に、あらすじを2〜3文で要約してください。

## ルール
- 公式あらすじの言い回しをコピーしない。筋だけを自分の言葉で書く
- 導入まで。中盤の逆転や結末は書かない
- 「——」「が……」で終わる予告調にしない
- 作品名は書かない（見出しがすでに名前）
- 日本語。各作品200字以内
- 渡された id をそのまま返す

## 作品
${batch
  .map(
    (work, index) => `### ${index + 1}. id=${work.id}
${work.synopsis}`
  )
  .join('\n\n')}
`

const ask = async batch => {
  const { stdout } = await run(
    'grok',
    [
      '-p',
      promptFor(batch),
      '--model',
      MODEL,
      '--reasoning-effort',
      'low',
      '--verbatim',
      '--disable-web-search',
      '--no-subagents',
      '--max-turns',
      '1',
      '--json-schema',
      SCHEMA,
      '--output-format',
      'json',
    ],
    { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true }
  )
  const envelope = firstJsonObject(stdout)
  if (!envelope) throw new Error('grok の出力を解釈できませんでした')
  const answer = envelope.structuredOutput ?? firstJsonObject(envelope.text ?? '')
  if (!answer?.items) throw new Error(envelope.structuredOutputError ?? '構造化出力が空でした')
  return answer.items
}

const chunks = (items, size) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const main = async () => {
  mkdirSync(CACHE_DIR, { recursive: true })
  const entries = loadSynopses()
  const snapshot = await db.collection(ANIMES_PATH).get()

  const pending = []
  const skipped = []
  for (const doc of snapshot.docs) {
    if (only && doc.id !== only) continue
    const meta = doc.get('metadata')?.animatetimes ?? {}
    const synopsis = synopsisFor(entries, meta)
    const name = doc.get('name')?.ja ?? doc.id
    if (!synopsis) {
      skipped.push({ id: doc.id, name, reason: 'あらすじなし' })
      continue
    }
    const cacheFile = `${CACHE_DIR}/${doc.id}.json`
    if (existsSync(cacheFile)) {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8'))
      if (cached.source === synopsis) {
        pending.push({ id: doc.id, name, synopsis, summary: cached.summary, cached: true })
        continue
      }
    }
    pending.push({ id: doc.id, name, synopsis, summary: null, cached: false })
  }

  const toAsk = pending.filter(work => !work.summary)
  console.log(`対象 ${pending.length} 件、生成 ${toAsk.length} 件、あらすじなし ${skipped.length} 件`)

  for (const [index, batch] of chunks(toAsk, BATCH).entries()) {
    console.log(`生成 ${index + 1}/${Math.ceil(toAsk.length / BATCH)}（${batch.length}件）`)
    const items = await ask(batch)
    const byId = new Map(items.map(item => [item.id, item.summary?.trim()]))
    for (const work of batch) {
      const summary = byId.get(work.id)
      if (!summary) throw new Error(`${work.id} の要約が返りませんでした`)
      if (summary.length > 280) console.warn(`  長い ${work.name} ${summary.length}字`)
      work.summary = summary
      writeFileSync(
        `${CACHE_DIR}/${work.id}.json`,
        JSON.stringify({ id: work.id, source: work.synopsis, summary }, null, 2)
      )
      console.log(`  ${work.name}`)
      console.log(`    ${summary}`)
    }
  }

  if (!apply) {
    console.log('書き込みはしていません。--apply で details/ja に merge します。')
    return
  }

  let written = 0
  for (const work of pending) {
    if (!work.summary) continue
    await db.doc(`${ANIMES_PATH}/${work.id}/details/ja`).set({ summary: work.summary }, { merge: true })
    written += 1
  }
  console.log(`書き込み ${written} 件`)
  if (skipped.length) {
    console.log('あらすじなし:')
    for (const work of skipped) console.log(`  ${work.name} ${work.id}`)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
