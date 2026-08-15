#!/usr/bin/env node
/**
 * Proposes tags for a work, from the tags that already exist.
 *
 *   node scripts/suggest-tags.mjs --limit 3       # works with no tags
 *   node scripts/suggest-tags.mjs --only <id>
 *   node scripts/suggest-tags.mjs --report
 *
 * Nothing is written. The output is a proposal to read and approve.
 *
 * The vocabulary is closed: the model picks from the 96 tags in the database
 * and may not invent one. What it thinks is missing goes in a separate list,
 * for a person to create or reject — the vocabulary already carries 日常 and
 * 日常系, and アルケミスト with each kind of bracket, which is what happens when
 * tags are minted freely.
 *
 * Every tag has to come with its reason: a sentence from the synopsis, or a URL
 * and a sentence quoted from that page. The quote is checked against the text
 * it claims to come from, the same way the cour answers are, because a model
 * asked for a justification will write one whether or not it has one.
 *
 * Body-shape tags (巨乳剣士, むちむち太もも) are offered like any other. They were
 * held back at first on the grounds that no text describes how a character is
 * drawn, which turned out to be half true: ケモ耳 came back quoted from a
 * Wikipedia character section, while 巨乳 came back attributed to a natalie
 * article that does not contain the sentence. The evidence check already tells
 * those two apart, so the category does not need a rule of its own. Pass
 * --no-appearance to leave them out.
 *
 * Requires: gcloud auth application-default login, and grok on PATH.
 */

import { execFile } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { promisify } from 'util'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const run = promisify(execFile)

const ANIMES_PATH = 'versions/1/animes'
const TAGS_PATH = 'versions/1/tags'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
const CACHE_DIR = '.cache/grok-tags'
const CONCURRENCY = 3
const TIMEOUT_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 20 * 1000
const MODEL = 'grok-4.6'
const EFFORT = 'high'

const APPEARANCE = /巨乳|貧乳|むちむち|見た目幼女/

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tag: { type: 'string' },
          source: { type: 'string', enum: ['synopsis', 'web'] },
          url: { type: 'string' },
          quote: { type: 'string' },
        },
        required: ['tag', 'source', 'url', 'quote'],
      },
    },
    newTags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['name', 'reason'],
      },
    },
  },
  required: ['tags', 'newTags'],
})

const promptFor = (work, vocabulary) => `異世界アニメのまとめサイトで、作品「${work.title}」に付けるタグを選んでください。

## 使えるタグ（この中からのみ選ぶ）

${vocabulary.join('、')}

## あらすじ（サイト掲載のもの）

${work.synopsis || '（あらすじの記録なし。ウェブで調べること）'}

## 指示

- **上の一覧にあるタグだけを選ぶ。** 一覧に無い語を tags に書かない
- 5〜8個。確信のあるものだけでよく、無理に数を埋めない
- タグごとに根拠を付ける
  - あらすじに書いてあるなら source="synopsis"、quote にあらすじの該当部分を
    **一字一句そのまま**写す（url は ""）
  - あらすじに無いなら、ウェブを検索して実際にページを開き、source="web"、
    url にそのページ、quote にそのページに書かれていた一文をそのまま写す
- **quote はあとで機械的に照合する。** 実在しない文を書くと検出される
- 根拠を示せないタグは選ばない。推測で付けない
- 一覧に無いが必要だと思うタグは newTags に理由付きで挙げる（作成はしない）

作品の内容に照らして、読み手が探すときに使う言葉を選んでください。`

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

const ask = async (work, vocabulary) => {
  const { stdout } = await run(
    'grok',
    [
      '-p',
      promptFor(work, vocabulary),
      '--model',
      MODEL,
      '--effort',
      EFFORT,
      '--json-schema',
      SCHEMA,
      '--output-format',
      'json',
    ],
    { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  )
  const envelope = firstJsonObject(stdout)
  if (!envelope) throw new Error('grok の出力を解釈できませんでした')
  const answer = envelope.structuredOutput ?? firstJsonObject(envelope.text ?? '')
  if (!answer) throw new Error(envelope.structuredOutputError ?? '構造化出力が空でした')
  return { answer, costUsd: envelope.total_cost_usd ?? 0 }
}

const stripHtml = html =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#\d+;|&[a-z]+;/gi, ' ')

const normalize = text =>
  String(text ?? '')
    .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')

const fetchPage = async url => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; isekai-plus-verifier/1.0)' },
    })
    return { status: response.status, text: response.ok ? await response.text() : '' }
  } finally {
    clearTimeout(timer)
  }
}

/** Fifteen characters is specific enough to be a real quote, short enough to survive markup. */
const QUOTE_LENGTH = 15

const verifyTag = async (entry, synopsis) => {
  const quote = normalize(entry.quote).slice(0, QUOTE_LENGTH)
  if (!quote) return { verdict: '根拠なし' }

  if (entry.source === 'synopsis') {
    return {
      verdict: normalize(synopsis).includes(quote) ? '検証済み' : 'あらすじに該当なし',
    }
  }

  try {
    const page = await fetchPage(entry.url)
    if (page.status !== 200) return { verdict: `到達不可(${page.status})` }
    return {
      verdict: normalize(stripHtml(page.text)).includes(quote) ? '検証済み' : 'ページに記述なし',
    }
  } catch (error) {
    return { verdict: error.name === 'AbortError' ? '到達不可(timeout)' : '到達不可' }
  }
}

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

/** The synopsis animatetimes printed, found through the work's tag id. */
const synopsisByTag = () => {
  const byTag = new Map()
  for (const file of readdirSync(WORKS_DIR).filter(name => name.endsWith('.yaml'))) {
    const doc = parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8'))
    for (const work of doc.works ?? []) {
      if (!work.workTagId || !work.synopsis) continue
      for (const tag of new Set([work.workTagId, work.seriesTagId].filter(Boolean))) {
        // Keep the longest: a sequel's page often repeats the premise in full
        // while the first season's is a single line.
        const current = byTag.get(tag)
        if (!current || current.length < work.synopsis.length) byTag.set(tag, work.synopsis)
      }
    }
  }
  return byTag
}

const load = async () => {
  const tags = await db.collection(TAGS_PATH).get()
  const byName = new Map()
  for (const tag of tags.docs) {
    const name = tag.get('name')?.ja
    if (name) byName.set(name.trim(), tag.id)
  }

  const synopses = synopsisByTag()
  const animes = await db.collection(ANIMES_PATH).get()
  const works = animes.docs.map(anime => ({
    id: anime.id,
    title: anime.get('name')?.ja ?? '',
    tagCount: (anime.get('tags') ?? []).length,
    synopsis: synopses.get(anime.get('metadata')?.animatetimes?.workTagId) ?? '',
  }))

  return { byName, works }
}

const report = (works, byName) => {
  for (const work of works) {
    const path = `${CACHE_DIR}/${work.id}.json`
    if (!existsSync(path)) continue
    const cached = JSON.parse(readFileSync(path, 'utf8'))

    console.log(`=== ${work.title}  [${work.id}]`)
    if (cached.error) {
      console.log(`  失敗: ${cached.error}\n`)
      continue
    }

    const accepted = []
    for (const entry of cached.answer.tags ?? []) {
      const verdict = cached.verification?.[entry.tag] ?? '未検証'
      const known = byName.has(entry.tag.trim())
      const mark = !known ? '一覧外' : verdict
      if (known && verdict === '検証済み') accepted.push(entry.tag)
      console.log(`  ${mark === '検証済み' ? '採用' : '除外'}  ${entry.tag}  [${mark}]`)
      console.log(`        ${entry.source === 'synopsis' ? 'あらすじ' : entry.url.slice(0, 60)}`)
      console.log(`        「${(entry.quote ?? '').slice(0, 60)}」`)
    }

    console.log(`  → 採用 ${accepted.length}件: ${accepted.join('、') || 'なし'}`)
    if (cached.answer.newTags?.length) {
      console.log(`  新規提案: ${cached.answer.newTags.map(t => `${t.name}（${t.reason}）`).join(' / ')}`)
    }
    console.log()
  }
}

const main = async () => {
  mkdirSync(CACHE_DIR, { recursive: true })
  const { byName, works } = await load()

  const noAppearance = process.argv.includes('--no-appearance')
  const vocabulary = [...byName.keys()].filter(name => !noAppearance || !APPEARANCE.test(name))

  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]
  const limitAt = process.argv.indexOf('--limit')
  const limit = limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1])

  const selected = only
    ? works.filter(work => work.id === only)
    : works.filter(work => work.tagCount === 0).slice(0, limit)

  if (process.argv.includes('--report')) return report(selected, byName)

  console.log(`対象 ${selected.length}件 / 使えるタグ ${vocabulary.length}種（外見タグ ${byName.size - vocabulary.length}種は除外）\n`)

  let index = 0
  let spent = 0

  const worker = async () => {
    while (index < selected.length) {
      const work = selected[index++]
      const position = index
      try {
        const { answer, costUsd } = await ask(work, vocabulary)
        spent += costUsd

        const verification = {}
        for (const entry of answer.tags ?? []) {
          verification[entry.tag] = (await verifyTag(entry, work.synopsis)).verdict
        }

        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify({ title: work.title, answer, verification, costUsd }, null, 2)
        )

        const accepted = (answer.tags ?? []).filter(
          entry => byName.has(entry.tag.trim()) && verification[entry.tag] === '検証済み'
        )
        console.log(
          `[${position}/${selected.length}] ${work.title.slice(0, 24)}  採用${accepted.length}/${(answer.tags ?? []).length}  ($${spent.toFixed(2)})`
        )
      } catch (error) {
        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify({ title: work.title, error: error.message }, null, 2)
        )
        console.log(`[${position}/${selected.length}] ${work.title.slice(0, 24)}  FAILED: ${error.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selected.length) }, worker))
  console.log(`\n完了。概算 $${spent.toFixed(2)}`)
  console.log('--report で提案を確認できます。書き込みはしていません')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
