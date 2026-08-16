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
const DICTIONARY = 'data/tags.yaml'
// Each work already fans out into eight group requests at once.
const CONCURRENCY = 1
const TIMEOUT_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 20 * 1000
const MODEL = 'grok-4.6'
const EFFORT = 'high'

/** Verdicts that mean a tag may be applied. */
const ACCEPTED = /^検証済み|^画像\d+\/\d+一致/

/**
 * Drops the tags a more specific one has replaced.
 *
 * 「ここは俺に任せて先に行けと言ってから10年がたったら伝説になっていた」 came back
 * with twenty three, including 巨乳 beside 巨乳剣士 and ファンタジー beside
 * 異世界ファンタジー. The dictionary already records which tag supersedes which;
 * this applies it.
 */
const prune = (names, dictionary) => {
  const kept = new Set(names)
  for (const name of names) {
    const tag = dictionary.tags.find(entry => entry.name === name)
    if (!tag) continue
    if (tag.narrower?.some(narrower => kept.has(narrower))) kept.delete(name)
    if (tag.excludedBy?.some(other => kept.has(other))) kept.delete(name)
  }
  return [...kept]
}

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
    characterPageUrl: { type: 'string' },
  },
  required: ['tags', 'newTags', 'characterPageUrl'],
})

const groupSection = (dictionary, key) => {
  const group = dictionary.groups.find(entry => entry.key === key)
  const tags = dictionary.tags.filter(tag => tag.group === key && !tag.aliasOf)
  const lines = tags.map(tag => {
    const examples = tag.examples?.length ? `（例: ${tag.examples.slice(0, 3).join('、')}）` : ''
    const narrower = tag.narrower?.length ? ` ※より具体的な ${tag.narrower.join('・')} があればそちらを選ぶ` : ''
    return `- ${tag.name}: ${tag.criteria}${narrower}${examples}`
  })
  return `### ${group.label}${group.note ? `（${group.note}）` : ''}\n${lines.join('\n')}`
}

const promptFor = (work, dictionary, key) => `異世界アニメのまとめサイト「いせかいぷらす」で、作品「${work.title}」に付けるタグを選んでください。

いまは **${dictionary.groups.find(group => group.key === key).label}** の群だけを見ます。

## この群のタグと判定基準

一覧に無い語は選べません。各行は「タグ名: そのタグを付ける条件（例: すでに付いている作品）」です。

${groupSection(dictionary, key)}

## あらすじ（サイト掲載のもの）

${work.synopsis || '（あらすじの記録なし。ウェブで調べること）'}

## 手順

1. **必ずウェブを検索し、Wikipedia か pixiv百科事典 の記事を最低1つは開く。**
   あらすじは数行しかないので、それだけで答えると必ず取りこぼす
2. 上の一覧を**1行ずつ上から順に**見て、当てはまるかどうかを判断する。
   飛ばさない。この群に当てはまるものが無ければ空で返してよい

## 根拠の付け方

- あらすじに書いてあるなら source="synopsis"、quote にあらすじの該当部分を
  **一字一句そのまま**写す（url は ""）
- あらすじに無いなら、ウェブを検索して実際にページを開き、source="web"、
  url にそのページ、quote にそのページに書かれていた一文をそのまま写す
- **quote はあとで機械的に照合する。** 実在しない文を書くと検出される
- 出典は取得できるページを選ぶ。公式サイトは取得できないことがあるので、
  Wikipedia・pixiv百科事典・ニュース記事など確実に読めるページを優先する
- 根拠を示せないタグは選ばない。推測で付けない

## そのほか

- 判定基準に合わないタグは、作品の雰囲気が近くても選ばない
- 一覧に無いが必要だと思うタグは newTags に理由付きで挙げる（作成はしない）
- 公式サイトのキャラクター紹介ページのURLが分かれば characterPageUrl に入れる
`

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

const askGroup = async (work, dictionary, key) => {
  const { stdout } = await run(
    'grok',
    [
      '-p',
      promptFor(work, dictionary, key),
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

/**
 * One request per group rather than one for the whole vocabulary.
 *
 * Handed all hundred tags with their criteria at once, the model returned a
 * single tag for 骸骨騎士様 and did not search at all — a list that long turns
 * the task into skimming. A group at a time is short enough to read line by
 * line, which is what the instruction asks for, and it makes each group's
 * decision independent of the others.
 */
const ask = async (work, dictionary) => {
  const tags = []
  const newTags = []
  let characterPageUrl = ''
  let costUsd = 0

  // The body group is decided from the pictures, further down. The rest are
  // independent questions, so they are asked at the same time.
  const results = await Promise.all(
    dictionary.groups
      .filter(group => group.key !== 'body')
      .map(group => askGroup(work, dictionary, group.key).catch(() => null))
  )

  const groupLabels = new Set(dictionary.groups.map(group => group.label))
  for (const result of results.filter(Boolean)) {
    costUsd += result.costUsd
    // A group's own label came back as a tag once, quoting the line of the
    // prompt that names it.
    tags.push(...(result.answer.tags ?? []).filter(entry => !groupLabels.has(entry.tag)))
    newTags.push(...(result.answer.newTags ?? []))
    if (!characterPageUrl && result.answer.characterPageUrl) {
      characterPageUrl = result.answer.characterPageUrl
    }
  }

  const seen = new Set()
  return {
    answer: {
      tags: tags.filter(entry => !seen.has(entry.tag) && seen.add(entry.tag)),
      // Two groups proposing 世直し is one proposal.
      newTags: newTags.filter(
        (entry, index) => newTags.findIndex(other => other.name === entry.name) === index
      ),
      characterPageUrl,
    },
    costUsd,
  }
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

const THUMB_DIR = '.cache/thumbs'
const THUMB_PREFIX = 'https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail'

/** The key visual, on disk, because grok reads an image from a path. */
const fetchThumbnail = async id => {
  const path = `${THUMB_DIR}/${id}.jpg`
  if (existsSync(path)) return path
  const response = await fetch(`${THUMB_PREFIX}/${id}.jpg`)
  if (!response.ok) return null
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
  return path
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

/** Navigation furniture, not a character. */
const NOT_A_PORTRAIT = /logo|icon|banner|btn|button|nav|header|footer|bg_|sns|twitter|\.svg($|\?)|youtube/i

/**
 * The character portraits from the official site.
 *
 * A key visual shows two or three of a cast; the character page shows all of
 * them, drawn full length, which is where a tag like 巨乳メイド is decided.
 * Some official sites cannot be fetched at all — mato-slave.com refuses — and
 * then the key visual is what there is.
 */
const characterImages = async (id, pageUrl) => {
  if (!pageUrl) return []
  let html = ''
  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
    })
    if (!response.ok) return []
    html = await response.text()
  } catch {
    return []
  }

  const urls = [...html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)/gi)]
    .map(match => match[1])
    .filter(url => !NOT_A_PORTRAIT.test(url))
    .map(url => {
      try {
        return new URL(url, pageUrl).href
      } catch {
        return null
      }
    })
    .filter(Boolean)

  const dir = `${THUMB_DIR}/${id}`
  mkdirSync(dir, { recursive: true })
  const saved = []
  for (const url of [...new Set(urls)]) {
    if (saved.length >= 6) break
    try {
      const response = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } })
      if (!response.ok) continue
      const bytes = Buffer.from(await response.arrayBuffer())
      // Under 15KB is a sprite or a spacer, not a character standing there.
      if (bytes.length < 15 * 1024) continue
      const path = `${dir}/${saved.length}.${url.split('.').pop()?.split('?')[0] ?? 'jpg'}`
      writeFileSync(path, bytes)
      saved.push(path)
    } catch {
      continue
    }
  }
  return saved
}

const IMAGE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    tags: { type: 'array', items: { type: 'string' } },
    observed: { type: 'string' },
  },
  required: ['tags', 'observed'],
})

const imagePromptFor = (work, paths, vocabulary) => `次の画像ファイルをすべて開いて、写っているキャラクターの外見を見てください。

${paths.map(path => `- ${path}`).join('\n')}

「${work.title}」のキービジュアルとキャラクター紹介画像です。

## 選べるタグ

${vocabulary.map(line => `- ${line}`).join('\n')}

## 指示

- **画像に実際に写っているものだけ**を選ぶ。作品名や設定から推測しない
- 当てはまるものが無ければ空で返す。無理に選ばない
- observed に、そう判断した見た目を短く書く（「中央の女性が長い銀髪」など）

画像に写っていないことは書かないでください。`

const askImage = async (work, paths, vocabulary) => {
  const { stdout } = await run(
    'grok',
    [
      '-p',
      imagePromptFor(work, paths, vocabulary),
      '--model',
      MODEL,
      '--json-schema',
      IMAGE_SCHEMA,
      '--output-format',
      'json',
    ],
    { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  )
  const envelope = firstJsonObject(stdout)
  const answer = envelope?.structuredOutput ?? firstJsonObject(envelope?.text ?? '')
  return { answer: answer ?? { tags: [], observed: '' }, costUsd: envelope?.total_cost_usd ?? 0 }
}

const IMAGE_PASSES = 3
const IMAGE_AGREEMENT = 2

/**
 * A picture cannot be quoted, so it is asked about three times and kept if two
 * passes saw it.
 *
 * Unanimity of two was the first rule and it was too strict in one direction
 * and not at all in the other: 骸骨騎士様's maid lost 巨乳メイド and kept the
 * vaguer 巨乳 because only one pass named the specific tag, while a single pass
 * is exactly what produced 巨乳 attached to a natalie sentence that does not
 * exist. Two of three keeps the specific tag and still needs corroboration.
 */
const askImageSeveralTimes = async (work, paths, vocabulary) => {
  const counts = new Map()
  let observed = ''
  let costUsd = 0

  for (let pass = 0; pass < IMAGE_PASSES; pass++) {
    const result = await askImage(work, paths, vocabulary)
    costUsd += result.costUsd
    if (!observed) observed = result.answer.observed ?? ''
    for (const tag of new Set(result.answer.tags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return {
    tags: [...counts].filter(([, seen]) => seen >= IMAGE_AGREEMENT).map(([tag]) => tag),
    counts: Object.fromEntries(counts),
    observed,
    costUsd,
  }
}

/**
 * Asks again for the tags whose source could not be read.
 *
 * 魔都精兵のスレイブ lost ハーレム, エロ and 恋愛 to an official site that will
 * not answer a fetch, and a later run found all three on Wikipedia. The answer
 * was right and only the citation was unusable, which is worth one more ask.
 */
const RETRY_VERDICTS = /到達不可|ページに記述なし|あらすじに該当なし/

const askAgainForSources = async (work, rejected) => {
  if (!rejected.length) return { tags: [], costUsd: 0 }

  const prompt = `作品「${work.title}」について、次のタグを提案しましたが、挙げられた出典が確認できませんでした。

${rejected.map(entry => `- ${entry.tag}: ${entry.url || 'あらすじ'} に「${entry.quote}」は見つかりませんでした`).join('\n')}

タグ自体が正しいと考えるなら、**別の確実に読めるページ**（Wikipedia、pixiv百科事典、
ニュース記事など）を開いて、そこに実際に書かれている一文を引用し直してください。
公式サイトは取得できないことがあるので避けてください。
正しい根拠が見つからないタグは、答えに含めないでください。`

  const { stdout } = await run(
    'grok',
    ['-p', prompt, '--model', MODEL, '--effort', EFFORT, '--json-schema', SCHEMA, '--output-format', 'json'],
    { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  )
  const envelope = firstJsonObject(stdout)
  const answer = envelope?.structuredOutput ?? firstJsonObject(envelope?.text ?? '')
  return { tags: answer?.tags ?? [], costUsd: envelope?.total_cost_usd ?? 0 }
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
      if (known && ACCEPTED.test(verdict)) accepted.push(entry.tag)
      console.log(`  ${known && ACCEPTED.test(verdict) ? '採用' : '除外'}  ${entry.tag}  [${mark}]`)
      console.log(`        ${entry.source === 'synopsis' ? 'あらすじ' : entry.url.slice(0, 60)}`)
      console.log(`        「${(entry.quote ?? '').slice(0, 60)}」`)
    }

    for (const tag of cached.image?.tags ?? []) {
      const seen = cached.image.counts?.[tag]
      // A tag the text already carried does not become two tags because the
      // picture agrees with it.
      const already = accepted.includes(tag)
      if (byName.has(tag.trim()) && !already) accepted.push(tag)
      console.log(`  ${!byName.has(tag.trim()) ? '除外' : already ? '重複' : '採用'}  ${tag}  [画像${seen ?? '?'}/3一致]`)
      console.log(`        キービジュアル: ${cached.image.observed}`)
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
  mkdirSync(THUMB_DIR, { recursive: true })
  const { byName, works } = await load()

  const noAppearance = process.argv.includes('--no-appearance')
  // The vocabulary and what each tag means, from the file rather than from the
  // names alone: two runs of the same work should be answering the same question.
  const dictionary = parse(readFileSync(DICTIONARY, 'utf8'))
  if (noAppearance) dictionary.tags = dictionary.tags.filter(tag => tag.group !== 'body')

  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]
  const limitAt = process.argv.indexOf('--limit')
  const limit = limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1])

  const selected = only
    ? works.filter(work => work.id === only)
    : works.filter(work => work.tagCount === 0).slice(0, limit)

  if (process.argv.includes('--report')) return report(selected, byName)

  console.log(
    `対象 ${selected.length}件 / 辞書 v${dictionary.version} ${dictionary.tags.length}種` +
      (noAppearance ? '（外見タグは除外）' : '') +
      '\n'
  )

  let index = 0
  let spent = 0

  const worker = async () => {
    while (index < selected.length) {
      const work = selected[index++]
      const position = index
      try {
        const { answer, costUsd } = await ask(work, dictionary)
        spent += costUsd

        const verification = {}
        const evidence = {}
        for (const entry of answer.tags ?? []) {
          verification[entry.tag] = (await verifyTag(entry, work.synopsis)).verdict
          evidence[entry.tag] = entry
        }

        // One more ask for the ones whose citation could not be read.
        const rejected = (answer.tags ?? []).filter(entry =>
          RETRY_VERDICTS.test(verification[entry.tag] ?? '')
        )
        const retry = await askAgainForSources(work, rejected)
        spent += retry.costUsd
        for (const entry of retry.tags) {
          const verdict = (await verifyTag(entry, work.synopsis)).verdict
          if (verdict === '検証済み') {
            verification[entry.tag] = '検証済み(再取得)'
            evidence[entry.tag] = entry
          }
        }

        // What the key visual and the character portraits show.
        let image = null
        if (!noAppearance) {
          const keyVisual = await fetchThumbnail(work.id)
          const portraits = await characterImages(work.id, answer.characterPageUrl)
          const paths = [keyVisual, ...portraits].filter(Boolean)
          if (paths.length) {
            const appearance = dictionary.tags
              .filter(tag => tag.group === 'body' && !tag.aliasOf)
              .map(tag => `${tag.name}: ${tag.criteria}`)
            const seen = await askImageSeveralTimes(work, paths, appearance)
            spent += seen.costUsd
            image = { tags: seen.tags, counts: seen.counts, observed: seen.observed, paths }
            for (const tag of seen.tags) {
              if (!verification[tag]) verification[tag] = `画像${seen.counts[tag]}/${IMAGE_PASSES}一致`
            }
          }
        }

        // Decided here so the report and the writer agree.
        const accepted = prune(
          Object.entries(verification)
            .filter(([tag, verdict]) => byName.has(tag.trim()) && ACCEPTED.test(verdict))
            .map(([tag]) => tag.trim()),
          dictionary
        )

        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify(
            {
              title: work.title,
              dictionaryVersion: dictionary.version,
              answer,
              evidence,
              image,
              verification,
              accepted,
              costUsd,
            },
            null,
            2
          )
        )

        console.log(
          `[${position}/${selected.length}] ${work.title.slice(0, 24)}  採用${accepted.length}  画像${image?.paths.length ?? 0}枚→${image?.tags.length ?? 0}件  ($${spent.toFixed(2)})`
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
