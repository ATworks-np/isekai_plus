#!/usr/bin/env node
/**
 * Finds the English title a work is released under.
 *
 *   node scripts/find-english-titles.mjs --limit 5     # ask (resumable)
 *   node scripts/find-english-titles.mjs --report      # review what came back
 *   node scripts/find-english-titles.mjs --apply       # write the verified ones
 *   node scripts/find-english-titles.mjs --only <id>
 *
 * A hundred works have no English title, so /en/animes/<id>/ shows the Japanese
 * one — and someone searching for "The Eminence in Shadow" never reaches the
 * page for 陰の実力者になりたくて！. That is the whole of the English site's SEO
 * problem: the pages exist and cannot be found.
 *
 * What is wanted is the title the work is *released* under in English, not a
 * translation of the Japanese and not a romanisation. So the answer has to name
 * a page that uses it — Crunchyroll, MyAnimeList, AniList, English Wikipedia —
 * and quote the line, which this script then looks for on that page. An
 * invented title cannot survive that, and 陰の実力者 already produced one
 * fabricated citation during the cour work.
 *
 * Requires: gcloud auth application-default login, grok on PATH, and
 * ISEKAI_API_KEY in .env.local
 */

import { execFile } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { promisify } from 'util'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const run = promisify(execFile)

const ANIMES_PATH = 'versions/1/animes'
const CACHE_DIR = '.cache/grok-titles'
const CONCURRENCY = 3
const TIMEOUT_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 20 * 1000
const MODEL = 'grok-4.6'
const EFFORT = 'high'

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    title: { type: 'string' },
    kind: { type: 'string', enum: ['official', 'romaji', 'none'] },
    url: { type: 'string' },
    quote: { type: 'string' },
  },
  required: ['found', 'title', 'kind', 'url', 'quote'],
})

const promptFor = (title, rejected) => `アニメ「${title}」の**英語版タイトル**を調べてください。
${rejected ? `
前回「${rejected}」と答えましたが、挙げられた出典ページからこちらで本文を取得できませんでした（MyAnimeList と Crunchyroll はボット対策で読めません）。**英語版Wikipedia など、取得できるページ**を出典にし直してください。タイトル自体が正しいなら、そのタイトルのまま別の出典を示してください。
` : ''}

## 探すもの

英語圏で配信・放送されたときの正式なタイトルです。日本語を翻訳したものでも、
ローマ字読みでもありません。

例:
- 陰の実力者になりたくて！ → The Eminence in Shadow
- 転生したらスライムだった件 → That Time I Got Reincarnated as a Slime
- 葬送のフリーレン → Frieren: Beyond Journey's End

## 手順

1. 英語版Wikipedia、Crunchyroll、MyAnimeList、AniList などを実際に開く
   （照合できるのは英語版Wikipediaやニュース記事です。MyAnimeListとCrunchyrollは
   こちらから取得できないので、可能なら別の出典を選んでください）
2. そのページで実際に使われているタイトルを取る
3. url にそのページ、quote にそのページに書かれていた**タイトルを含む一文**を
   一字一句そのまま写す

## 判断

- 正式な英題が見つかった → kind="official"
- ローマ字表記しか見つからない（Mushoku Tensei のような）→ kind="romaji"
- 英語圏でリリースされていない → found=false, kind="none"

**quote はあとで機械的に照合します。** 実在しない文を書くと検出されます。
見つからないものを無理に作らないでください。`

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

const ask = async (title, rejected) => {
  const { stdout } = await run(
    'grok',
    [
      '-p',
      promptFor(title, rejected),
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
    .replace(/&nbsp;|&#\d+;|&amp;/gi, ' ')

const normalize = text =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[^a-z0-9']+/g, '')

const fetchPage = async url => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      },
    })
    return { status: response.status, text: response.ok ? await response.text() : '' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The title has to appear on the page, not merely the sentence around it.
 * Checking the title itself is what catches a real quote with an invented name
 * spliced into it.
 */
const verify = async answer => {
  if (!answer.found || !answer.title?.trim()) return '該当なし'
  if (!answer.url) return '出典なし'

  try {
    const page = await fetchPage(answer.url)
    if (page.status !== 200) return `到達不可(${page.status})`
    const body = normalize(stripHtml(page.text))
    if (!body.includes(normalize(answer.title))) return 'タイトルがページに無い'
    return '検証済み'
  } catch (error) {
    return error.name === 'AbortError' ? '到達不可(timeout)' : '到達不可'
  }
}

const readEnv = file =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line.includes('='))
      .map(line => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )

const env = readEnv('.env')
const local = existsSync('.env.local') ? readEnv('.env.local') : {}
const BASE = process.env.ISEKAI_API_BASE ?? local.ISEKAI_API_BASE ?? 'https://ani-mato.net'

initializeApp({
  credential: applicationDefault(),
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
})
const db = getFirestore()

const load = async () => {
  const snapshot = await db.collection(ANIMES_PATH).get()
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ja: doc.get('name')?.ja ?? '',
    en: doc.get('name')?.en,
  }))
}

const cachedFor = id => {
  const path = `${CACHE_DIR}/${id}.json`
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

const report = works => {
  const rows = works.map(work => ({ work, cached: cachedFor(work.id) })).filter(row => row.cached)
  const accepted = []

  for (const { work, cached } of rows) {
    if (cached.error) {
      console.log(`失敗  ${work.ja}: ${cached.error}`)
      continue
    }
    const { answer, verdict } = cached
    const usable = verdict === '検証済み' && answer.kind === 'official'
    if (usable) accepted.push({ work, title: answer.title })
    console.log(
      `${usable ? '採用' : '除外'}  ${work.ja.slice(0, 22)}  →  ${answer.title || '（なし）'}  [${answer.kind}/${verdict}]`
    )
    if (answer.url) console.log(`        ${answer.url.slice(0, 70)}`)
  }

  console.log(`\n照合済み ${rows.length}件 / 採用 ${accepted.length}件`)
  return accepted
}

const main = async () => {
  mkdirSync(CACHE_DIR, { recursive: true })
  const works = await load()

  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]
  const limitAt = process.argv.indexOf('--limit')
  const limit = limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1])

  const missing = works.filter(work => (only ? work.id === only : work.en === undefined))

  if (process.argv.includes('--report')) return void report(missing)

  if (process.argv.includes('--apply')) {
    const key = local.ISEKAI_API_KEY
    if (!key) throw new Error('.env.local に ISEKAI_API_KEY がありません')
    const accepted = report(missing)
    console.log()

    for (const { work, title } of accepted) {
      const response = await fetch(`${BASE}/api/v1/animes/${work.id}/`, {
        method: 'PATCH',
        headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
        // name is replaced wholesale, so the Japanese title goes back with it.
        body: JSON.stringify({ name: { ja: work.ja, en: title } }),
      })
      console.log(`${response.ok ? '書込' : `失敗 ${response.status}`}  ${work.ja} → ${title}`)
    }
    return
  }

  // Sources we cannot fetch are not wrong answers: MyAnimeList and Crunchyroll
  // both answer a bot with a challenge page, and every failed check cited one
  // of the two. Those get one more ask, for a source that can be read.
  const retrying = process.argv.includes('--retry')
  const pending = retrying
    ? missing.filter(work => {
        const cached = cachedFor(work.id)
        return cached && !cached.error && /ページに無い|到達不可/.test(cached.verdict ?? '')
      })
    : missing.filter(work => only || !existsSync(`${CACHE_DIR}/${work.id}.json`)).slice(0, limit)
  console.log(`英題なし ${missing.length}件 / これから ${pending.length}件\n`)

  let index = 0
  let spent = 0

  const worker = async () => {
    while (index < pending.length) {
      const work = pending[index++]
      const position = index
      try {
        const previous = retrying ? cachedFor(work.id)?.answer?.title : undefined
        const { answer, costUsd } = await ask(work.ja, previous)
        spent += costUsd
        const verdict = await verify(answer)
        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify({ ja: work.ja, answer, verdict, costUsd }, null, 2)
        )
        console.log(
          `[${position}/${pending.length}] ${work.ja.slice(0, 22)} → ${answer.title || '（なし）'} [${answer.kind}/${verdict}]`
        )
      } catch (error) {
        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify({ ja: work.ja, error: error.message }, null, 2)
        )
        console.log(`[${position}/${pending.length}] ${work.ja.slice(0, 22)} FAILED: ${error.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))
  console.log(`\n完了。概算 $${spent.toFixed(2)}`)
  console.log('--report で確認、--apply で書き込み')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
