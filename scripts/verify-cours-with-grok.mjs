#!/usr/bin/env node
/**
 * Checks every work's cours against Japanese Wikipedia, via the grok CLI.
 *
 *   node scripts/verify-cours-with-grok.mjs            # run (resumable)
 *   node scripts/verify-cours-with-grok.mjs --report   # compare cached answers to the database
 *   node scripts/verify-cours-with-grok.mjs --only <animeId>
 *
 * animatetimes' 公開開始年＆季節 is the set of season pages a programme appears
 * on, not the quarters it aired in, and its スケジュール often records only the
 * first cour of a split run. Neither is enough on its own — 転生したらスライム
 * だった件 had a rerun counted as a season and its second cour missing at the
 * same time.
 *
 * Answers are cached per work under .cache/grok/, so a run that is interrupted
 * or rate limited picks up where it stopped. Nothing is written to the
 * database; --report prints what disagrees for a human to decide.
 *
 * Requires: gcloud auth application-default login, and grok on PATH.
 */

import { execFile } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { promisify } from 'util'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const run = promisify(execFile)

const ANIMES_PATH = 'versions/1/animes'
const CACHE_DIR = '.cache/grok'
const CONCURRENCY = 3
const TIMEOUT_MS = 15 * 60 * 1000

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    seasons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          cours: { type: 'array', items: { type: 'string' } },
          isRerun: { type: 'boolean' },
        },
        required: ['label', 'cours', 'isRerun'],
      },
    },
    source: { type: 'string' },
  },
  required: ['found', 'seasons', 'source'],
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

const promptFor = (title, insist) => `日本語版Wikipediaで「${title}」のテレビアニメを調べ、シリーズ（期）ごとの放送クールを答えてください。

**必ず ja.wikipedia.org の記事を実際に開いて本文を確認してから答えること。**
検索結果だけで判断したり、記事を開かずに found=false としてはいけない。
DBのタイトルは略称のことがあるので、副題付きの正式タイトルや原作記事も探すこと。
${insist ? '前回この作品を found=false と答えたが、記事は存在する可能性が高い。もう一度必ず記事を開いて確認すること。\n' : ''}
- クールは YYYY-QN 形式。Q1=1〜3月、Q2=4〜6月、Q3=7〜9月、Q4=10〜12月
- 2クール以上にまたがる放送は、またがった全クールを列挙する（例: 2018年10月〜2019年3月なら ["2018-Q4","2019-Q1"]）
- 分割放送（第1クール・第2クールが離れている）も同じ期にまとめ、両方のクールを列挙する
- 再放送・総集編は isRerun=true の別項目にする。本放送と混ぜない
- 劇場版・OVA・配信限定は含めない
- 該当するテレビアニメが見つからなければ found=false

出典URLも返してください。`

/** The model sometimes repeats its answer; take the first complete object. */
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

const ask = async (title, insist = false) => {
  const { stdout } = await run(
    'grok',
    ['-p', promptFor(title, insist), '--json-schema', SCHEMA, '--output-format', 'json'],
    { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  )
  const envelope = firstJsonObject(stdout)
  if (!envelope) throw new Error('grok の出力を解釈できませんでした')
  const answer = envelope.structuredOutput ?? firstJsonObject(envelope.text ?? '')
  if (!answer) throw new Error(envelope.structuredOutputError ?? '構造化出力が空でした')
  return { answer, costUsd: envelope.total_cost_usd ?? 0 }
}

const loadWorks = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  const works = []
  for (const anime of animes.docs) {
    const seasons = await anime.ref.collection('seasons').orderBy('order').get()
    works.push({
      id: anime.id,
      title: anime.get('name')?.ja ?? '',
      cours: [...new Set((anime.get('cours') ?? []).filter(Boolean))].sort(),
      seasons: seasons.docs.map(season => ({
        id: season.id,
        label: season.get('label'),
        cours: [...(season.get('cours') ?? [])].sort(),
      })),
    })
  }
  return works
}

const report = works => {
  let checked = 0
  let agree = 0
  const issues = []

  for (const work of works) {
    const path = `${CACHE_DIR}/${work.id}.json`
    if (!existsSync(path)) continue
    checked++

    const cached = JSON.parse(readFileSync(path, 'utf8'))
    if (cached.error) {
      issues.push({ work, kind: '調査失敗', detail: cached.error })
      continue
    }
    const answer = cached.answer
    if (!answer.found) {
      issues.push({ work, kind: 'Wikipedia に該当なし', detail: '' })
      continue
    }

    const broadcast = answer.seasons.filter(s => !s.isRerun)
    const wiki = [...new Set(broadcast.flatMap(s => s.cours))].sort()
    const reruns = [...new Set(answer.seasons.filter(s => s.isRerun).flatMap(s => s.cours))]

    const missing = wiki.filter(c => !work.cours.includes(c))
    const extra = work.cours.filter(c => !wiki.includes(c))

    if (!missing.length && !extra.length) {
      agree++
      continue
    }
    issues.push({
      work,
      kind: '不一致',
      wiki,
      missing,
      extra,
      rerunOverlap: extra.filter(c => reruns.includes(c)),
      wikiSeasons: broadcast,
      source: answer.source,
    })
  }

  console.log(`\n照合済み ${checked} / ${works.length}  一致 ${agree}  要確認 ${issues.length}\n`)
  for (const issue of issues) {
    console.log(`=== ${issue.work.title}  [${issue.work.id}]`)
    console.log(`  DB   : ${JSON.stringify(issue.work.cours)}`)
    if (issue.kind !== '不一致') {
      console.log(`  ${issue.kind}${issue.detail ? ': ' + issue.detail : ''}\n`)
      continue
    }
    console.log(`  Wiki : ${JSON.stringify(issue.wiki)}`)
    if (issue.missing.length) console.log(`  不足 : ${JSON.stringify(issue.missing)}`)
    if (issue.extra.length) {
      console.log(
        `  余分 : ${JSON.stringify(issue.extra)}${
          issue.rerunOverlap.length ? `  （うち再放送: ${JSON.stringify(issue.rerunOverlap)}）` : ''
        }`
      )
    }
    issue.wikiSeasons.forEach(s => console.log(`     ${s.label}  ${JSON.stringify(s.cours)}`))
    console.log(`  出典 : ${issue.source}\n`)
  }
}

const main = async () => {
  mkdirSync(CACHE_DIR, { recursive: true })
  const works = await loadWorks()

  if (process.argv.includes('--report')) return report(works)

  // indexOf returns -1 when the flag is absent, which would otherwise read
  // argv[0] — the node binary — and match nothing.
  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]
  const pending = works.filter(work =>
    only ? work.id === only : !existsSync(`${CACHE_DIR}/${work.id}.json`)
  )

  const done = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).length
  console.log(`作品 ${works.length}件 / 済 ${done}件 / これから ${pending.length}件`)
  console.log(`並列 ${CONCURRENCY}、1件あたり約 $0.2\n`)

  let index = 0
  let spent = 0
  let failed = 0

  const worker = async () => {
    while (index < pending.length) {
      const work = pending[index++]
      const position = index
      try {
        let { answer, costUsd } = await ask(work.title)
        // A schema-constrained answer sometimes comes back without the model
        // having opened anything; one insistent retry recovers most of them.
        if (!answer.found || answer.seasons.length === 0) {
          const retry = await ask(work.title, true)
          costUsd += retry.costUsd
          if (retry.answer.found && retry.answer.seasons.length) answer = retry.answer
        }
        spent += costUsd
        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify({ title: work.title, answer, costUsd }, null, 2)
        )
        const cours = [...new Set(answer.seasons.filter(s => !s.isRerun).flatMap(s => s.cours))].sort()
        console.log(
          `[${position}/${pending.length}] ${work.title.slice(0, 26)}  -> ${JSON.stringify(cours)}  ($${spent.toFixed(2)})`
        )
      } catch (error) {
        failed++
        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify({ title: work.title, error: error.message }, null, 2)
        )
        console.log(`[${position}/${pending.length}] ${work.title.slice(0, 26)}  FAILED: ${error.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))
  console.log(`\n完了。失敗 ${failed}件 / 概算 $${spent.toFixed(2)}`)
  console.log('--report で DB と照合できます')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
