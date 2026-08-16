#!/usr/bin/env node
/**
 * Proposes the character-axis tags for a work by looking at its pictures.
 *
 *   node scripts/suggest-character-tags.mjs --limit 10     # ask (resumable)
 *   node scripts/suggest-character-tags.mjs --report       # read what came back
 *   node scripts/suggest-character-tags.mjs --push         # send to the review queue
 *   node scripts/suggest-character-tags.mjs --only <id>
 *
 * The character axis is the one the site is judged on and the one furthest
 * behind: 112 of 155 works carry nothing from it, so 「巨乳」 returns a handful
 * of the works it should. It is also the only axis that can be settled by
 * looking. A synopsis never says who is busty or who has animal ears, and asking
 * a model to infer it from a title is how a tag gets invented.
 *
 * So the question put to the model is the owner's own test, unchanged: is this
 * character on the key visual, or on the official site's character page? That is
 * checkable — the images are on disk when the answer comes back — and it is the
 * criteria now stored on every tag.
 *
 * A picture cannot be quoted the way a sentence can, so each set is read three
 * times in separate calls and a tag is kept when two of them saw it. One pass
 * alone will occasionally describe a character who is not there.
 *
 * Nothing is written to a work. Accepted proposals go to a review queue for a
 * person to approve.
 *
 * Requires: gcloud auth application-default login, grok on PATH.
 */

import { execFile } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { promisify } from 'util'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const run = promisify(execFile)

const ANIMES_PATH = 'versions/1/animes'
const TAGS_PATH = 'versions/1/tags'
const QUEUE_PATH = 'versions/1/tagProposals'
const CACHE_DIR = '.cache/character-tags'
const THUMB_DIR = '.cache/thumbs'
const THUMB_PREFIX = 'https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail'

const MODEL = 'grok-4.6'
const TIMEOUT_MS = 15 * 60 * 1000
const PASSES = 3
const AGREEMENT = 2
const CONCURRENCY = 5

/**
 * A pass that claims this many of the vocabulary has stopped looking.
 *
 * One reading of ライザのアトリエ returned thirty-three tags — 神, 四天王, 王,
 * 王女, 勇者, 聖騎士 — each justified as 「神的な存在」, 「四天王的な存在」: the tag
 * name with a suffix, describing nobody. A key visual and six portraits do not
 * legitimately carry thirty character attributes, and letting that pass vote
 * means anything a real reading saw is already halfway to accepted.
 */
const RUNAWAY_PASS = 12

/** A justification that only restates the tag name saw nothing. */
const SAYS_NOTHING = (name, who) => {
  const text = String(who ?? '').trim()
  if (text.length < 5) return true
  const stripped = text.replace(name, '').replace(/[的風な様のっぽい存在人物姿キャラクター\s]/g, '')
  return stripped.length < 3
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

/** Navigation furniture, not a character. */
const NOT_A_PORTRAIT = /logo|banner|btn|button|nav|header|footer|bg_|sns|twitter|\.svg($|\?)|youtube/i

/**
 * A photograph of a voice actor, not a drawing of a character.
 *
 * Official sites put the cast comments in a hidden modal on the same page, and
 * those images are headshots of real people. 悪役令嬢転生おじさん handed back five
 * of them and one character, and the model duly described a blonde noble lady
 * in a photograph of a man in a suit.
 */
const IS_CAST_PHOTO = /\/modal\/|cast[-_]|staff|voice|seiyu|interview|comment/i

/**
 * How much a URL looks like a character portrait.
 *
 * Size cannot decide this. The portraits on that page are 6–9KB icons and the
 * voice actor photographs are 112KB, so a floor that called small files sprites
 * discarded every character and kept every photograph — the exact inversion of
 * what was wanted.
 */
const portraitScore = url => {
  if (IS_CAST_PHOTO.test(url) || NOT_A_PORTRAIT.test(url)) return -1
  let score = 0
  if (/character|chara\/|chr\//i.test(url)) score += 10
  if (/main|full|stand|body/i.test(url)) score += 5
  if (/icon|thumb|small/i.test(url)) score += 1
  return score
}

/**
 * Compound tags are kept, and the properties they name are added beside them,
 * so that a search for 巨乳 or for 剣士 reaches the same nineteen works that
 * 巨乳剣士 does.
 */
const EXPANDS = {
  巨乳剣士: ['巨乳', '剣士'],
  巨乳メイド: ['巨乳', 'メイド'],
  巨乳エルフ: ['巨乳', 'エルフ'],
  巨乳神官: ['巨乳', '神官'],
  貧乳エルフ: ['エルフ'],
  魔王の娘: ['魔王'],
}

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          where: { type: 'string' },
          who: { type: 'string' },
        },
        required: ['name', 'where', 'who'],
      },
    },
    characterPageUrl: { type: 'string' },
  },
  required: ['tags', 'characterPageUrl'],
})

const promptFor = (work, paths, vocabulary) => `異世界アニメのまとめサイトで、作品「${work.ja}」に付ける**キャラクターのタグ**を選んでください。

## 見るもの

次の画像をすべて開いてください。キービジュアルと、公式サイトのキャラクター紹介の画像です。

${paths.map(path => `- ${path}`).join('\n')}

## 選べるタグ（この中からのみ）

${vocabulary.map(t => `- ${t.name}: ${t.criteria}`).join('\n')}

## 判定の基準

**画像に実際に写っている人物についてだけ**答えてください。

- 作品名や設定から推測しない。「エルフが出てきそう」では付けない
- 背景に小さく写っているモブは数えない。**紹介されている人物**が対象
- 主人公に限らない。**主要人物なら誰でも**よい
- 当てはまるものが無ければ空の配列を返す。無理に選ばない

## 各タグに書くもの

- name: タグ名（上の一覧の表記のまま）
- who: その人物の見た目（「中央の銀髪の女性」「右端の犬耳の少女」など）
- where: どの画像で見たか（ファイル名）

写っていないものを書かないでください。あとで同じ画像を別の目で確認します。`

const firstJsonObject = text => {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
    }
  }
  return null
}

const ask = async (work, paths, vocabulary) => {
  const { stdout } = await run(
    'grok',
    ['-p', promptFor(work, paths, vocabulary), '--model', MODEL, '--json-schema', SCHEMA, '--output-format', 'json'],
    { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  )
  const envelope = firstJsonObject(stdout)
  const answer = envelope?.structuredOutput ?? firstJsonObject(envelope?.text ?? '')
  return { answer: answer ?? { tags: [], characterPageUrl: '' }, costUsd: envelope?.total_cost_usd ?? 0 }
}

const thumbnailUrl = id => `${THUMB_PREFIX}/${id}.jpg`

/**
 * Whether the character page the model named is a page.
 *
 * 悪役令嬢転生おじさん was given two different official sites on two runs —
 * tensei-ojisan.com once, akuyaku-ojisan.com the next — and only the first
 * answers. The name of a site is exactly the kind of plausible-looking string
 * that gets composed rather than recalled, and an unreachable one silently
 * costs every portrait on it.
 */
const reachable = async url => {
  if (!url || !/^https?:\/\//.test(url)) return false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    return response.ok
  } catch {
    return false
  }
}

const fetchThumbnail = async id => {
  mkdirSync(THUMB_DIR, { recursive: true })
  const path = `${THUMB_DIR}/${id}.jpg`
  if (existsSync(path)) return path
  try {
    const response = await fetch(thumbnailUrl(id))
    if (!response.ok) return null
    writeFileSync(path, Buffer.from(await response.arrayBuffer()))
    return path
  } catch {
    return null
  }
}

/**
 * The portraits from the official site. A key visual shows two or three of a
 * cast; the character page shows all of them, full length, which is where a tag
 * like 巨乳メイド is actually decided.
 */
const characterImages = async (id, pageUrl) => {
  if (!pageUrl) return []
  let html = ''
  try {
    const response = await fetch(pageUrl, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' } })
    if (!response.ok) return []
    html = await response.text()
  } catch {
    return []
  }

  const urls = [...new Set(
    [...html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)/gi)]
      .map(match => match[1])
      .map(url => { try { return new URL(url, pageUrl).href } catch { return null } })
      .filter(Boolean)
  )]
    .map(url => ({ url, score: portraitScore(url) }))
    .filter(entry => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.url)

  const dir = `${THUMB_DIR}/${id}`
  mkdirSync(dir, { recursive: true })
  const saved = []
  for (const url of urls) {
    if (saved.length >= 8) break
    try {
      const response = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } })
      if (!response.ok) continue
      const bytes = Buffer.from(await response.arrayBuffer())
      // Only a spacer or a tracking pixel is this small. The floor used to be
      // 15KB, which is larger than every character icon on some sites.
      if (bytes.length < 3 * 1024) continue
      const path = `${dir}/${saved.length}.${url.split('.').pop()?.split('?')[0] ?? 'jpg'}`
      writeFileSync(path, bytes)
      saved.push({ path, url })
    } catch {
      continue
    }
  }
  return saved
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

initializeApp({ credential: applicationDefault(), projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
const db = getFirestore()

const cachedFor = id => {
  const path = `${CACHE_DIR}/${id}.json`
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

const main = async () => {
  mkdirSync(CACHE_DIR, { recursive: true })

  const [tagsSnap, worksSnap] = await Promise.all([
    db.collection(TAGS_PATH).get(),
    db.collection(ANIMES_PATH).get(),
  ])

  // The character axis, plus the professions a compound expands into.
  const expansionNames = new Set(Object.values(EXPANDS).flat())
  const vocabulary = tagsSnap.docs
    .filter(doc => doc.get('axis') === 'character' || expansionNames.has(doc.get('name')?.ja))
    .map(doc => ({ id: doc.id, name: doc.get('name')?.ja, criteria: doc.get('criteria') ?? '' }))
  const idByName = Object.fromEntries(vocabulary.map(t => [t.name, t.id]))

  const works = worksSnap.docs.map(doc => ({
    id: doc.id,
    ja: doc.get('name')?.ja ?? '',
    reviewed: doc.get('tagging')?.reviewed?.character ?? null,
  }))

  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]
  const limitAt = process.argv.indexOf('--limit')
  const limit = limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1])

  if (process.argv.includes('--report')) {
    let proposed = 0
    for (const work of works) {
      const cached = cachedFor(work.id)
      if (!cached) continue
      if (cached.error) { console.log(`失敗  ${work.ja}: ${cached.error}`); continue }
      proposed += cached.accepted.length
      console.log(`${work.ja.slice(0, 26)}  画像${cached.imageCount}枚`)
      for (const tag of cached.accepted) {
        console.log(`    ${tag.name.padEnd(10)} ${tag.passes}/${PASSES}回一致  ${tag.who}`)
      }
      const dropped = cached.rejected.filter(t => t.passes === 1)
      if (dropped.length) console.log(`    （1回だけ: ${dropped.map(t => t.name).join(', ')}）`)
    }
    console.log(`\n提案 ${proposed}件`)
    return
  }

  if (process.argv.includes('--push')) {
    let pushed = 0
    for (const work of works) {
      const cached = cachedFor(work.id)
      if (!cached || cached.error || !cached.accepted.length) continue
      if (work.reviewed) continue
      await db.doc(`${QUEUE_PATH}/${work.id}`).set(
        {
          animeId: work.id,
          name: work.ja,
          axis: 'character',
          status: 'pending',
          proposals: cached.accepted.map(tag => ({
            tagId: idByName[tag.name] ?? null,
            name: tag.name,
            who: tag.who,
            passes: tag.passes,
          })),
          images: cached.imageUrls ?? [thumbnailUrl(work.id)],
          characterPageUrl: cached.characterPageUrl ?? '',
          proposedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      pushed += 1
    }
    console.log(`レビュー待ちに送った: ${pushed}作品`)
    return
  }

  const pending = works
    .filter(work =>
      only ? work.id === only : !work.reviewed && !existsSync(`${CACHE_DIR}/${work.id}.json`)
    )
    .slice(0, limit)

  const answered = works.filter(work => work.reviewed).length
  if (answered) console.log(`承認済み ${answered}作品はとばす`)

  console.log(`語彙 ${vocabulary.length}件 / これから ${pending.length}作品\n`)

  let index = 0
  let spent = 0

  const worker = async () => {
    while (index < pending.length) {
      const work = pending[index++]
      const position = index
      try {
        const thumb = await fetchThumbnail(work.id)
        // One cheap pass first, only to learn where the character page is.
        const scout = thumb ? await ask(work, [thumb], vocabulary) : { answer: {}, costUsd: 0 }
        spent += scout.costUsd
        // One more ask when the page it named does not answer: the second
        // guess is often the real site, and without it the work is judged from
        // the key visual alone.
        let pageUrl = scout.answer.characterPageUrl ?? ''
        if (pageUrl && !(await reachable(pageUrl))) {
          const retry = thumb ? await ask(work, [thumb], vocabulary) : { answer: {}, costUsd: 0 }
          spent += retry.costUsd
          const second = retry.answer.characterPageUrl ?? ''
          pageUrl = second && second !== pageUrl && (await reachable(second)) ? second : ''
        }

        const portraits = await characterImages(work.id, pageUrl)
        const images = [thumb, ...portraits.map(p => p.path)].filter(Boolean)
        const imageUrls = [thumb ? thumbnailUrl(work.id) : null, ...portraits.map(p => p.url)].filter(Boolean)

        if (!images.length) {
          writeFileSync(`${CACHE_DIR}/${work.id}.json`, JSON.stringify({ ja: work.ja, error: '画像が取れなかった' }, null, 2))
          console.log(`[${position}/${pending.length}] ${work.ja.slice(0, 24)} — 画像なし`)
          continue
        }

        const seen = {}
        let discarded = 0
        for (let pass = 0; pass < PASSES; pass++) {
          const result = await ask(work, images, vocabulary)
          spent += result.costUsd
          const proposed = (result.answer.tags ?? []).filter(tag => idByName[tag.name])
          if (proposed.length > RUNAWAY_PASS) {
            discarded += 1
            continue
          }
          for (const tag of proposed) {
            if (SAYS_NOTHING(tag.name, tag.who)) continue
            seen[tag.name] = seen[tag.name] ?? { name: tag.name, passes: 0, who: tag.who, where: tag.where }
            seen[tag.name].passes += 1
            // Keep the description that says the most; it is what a person
            // checks the proposal against.
            if ((tag.who ?? '').length > (seen[tag.name].who ?? '').length) seen[tag.name].who = tag.who
          }
        }

        // With a runaway pass thrown out there may be too few left to agree, so
        // the bar is two readings or every reading that counted, whichever is
        // lower — one surviving pass still has to have described someone.
        const counted = PASSES - discarded
        const bar = Math.min(AGREEMENT, Math.max(counted, 1))
        const accepted = Object.values(seen).filter(tag => tag.passes >= bar)
        const rejected = Object.values(seen).filter(tag => tag.passes < bar)

        // A compound implies the properties it names, so they come along.
        for (const tag of [...accepted]) {
          for (const name of EXPANDS[tag.name] ?? []) {
            if (accepted.some(t => t.name === name) || !idByName[name]) continue
            accepted.push({ name, passes: tag.passes, who: `${tag.name} から`, where: tag.where })
          }
        }

        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify(
            { ja: work.ja, images, imageUrls, imageCount: images.length, discardedPasses: discarded, characterPageUrl: pageUrl, accepted, rejected },
            null,
            2
          )
        )
        console.log(
          `[${position}/${pending.length}] ${work.ja.slice(0, 24)} 画像${images.length} → ${accepted.map(t => t.name).join(', ') || '（なし）'}`
        )
      } catch (error) {
        writeFileSync(`${CACHE_DIR}/${work.id}.json`, JSON.stringify({ ja: work.ja, error: error.message }, null, 2))
        console.log(`[${position}/${pending.length}] ${work.ja.slice(0, 24)} FAILED: ${error.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))
  console.log(`\n完了。概算 $${spent.toFixed(2)}`)
  console.log('--report で確認、--push でレビュー待ちに送る')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
