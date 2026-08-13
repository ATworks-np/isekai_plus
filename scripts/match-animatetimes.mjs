#!/usr/bin/env node
/**
 * Matches every database work to its animatetimes entries. Read only.
 *
 *   node scripts/match-animatetimes.mjs            # summary + unmatched
 *   node scripts/match-animatetimes.mjs --all      # every work
 *
 * A database record is one series, so it can match several entries: a first
 * season, its sequels, its reruns. The series tag id ties them together where
 * it is present — it is only stamped on sequels, so a first season is reached
 * through its title and the sequels are then reached through its id.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, readdirSync } from 'fs'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
const showAll = process.argv.includes('--all')

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

/** Only cosmetic differences are removed; sequel markers stay meaningful here. */
const normalize = title =>
  title
    .normalize('NFKC')
    .replace(/[〜～~]/g, '~')
    .replace(/[“”„‟"]/g, '"')
    .replace(/[‘’‚‛']/g, "'")
    .replace(/[!！?？]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()

/** Strips what marks an instalment, leaving the series it belongs to. */
const seriesKey = title => {
  let text = title.normalize('NFKC')
  for (const marker of [
    /[（(]?\s*第\s*[0-9]+\s*(期|クール|シーズン|部|章)\s*[）)]?/g,
    /[（(]\s*(前半|後半)\s*クール\s*[）)]/g,
    /[（(]\s*[0-9]+\s*期\s*[／\/]\s*第\s*[0-9]+\s*部\s*[）)]/g,
    /[0-9]+\s*(?:st|nd|rd|th)\s*season/gi,
    /season\s*[0-9]+/gi,
    /(?:セカンド|サード)\s*シーズン/g,
    /[ⅡⅢⅣⅤ]/g,
    /(?<![A-Za-z])(?:III|II|IV|V|ll|LL)(?![A-Za-z])/g,
    /[（(]\s*再放送\s*[）)]/g,
  ]) {
    text = text.replace(marker, ' ')
  }
  return normalize(text.replace(/[-‐-―—~〜～\s]*[0-9]+\s*$/u, ' '))
}

/**
 * Dice coefficient over character bigrams.
 *
 * Prefix matching cannot see past the first difference, and every remaining
 * mismatch is a small one somewhere in the middle: a missing 長音符 in
 * 勇者パーティ vs 勇者パーティー, a stray 。, a ― typed where ー belongs. Overlap
 * counts those as almost identical while keeping genuinely different titles
 * that share an opening far apart.
 */
const similarity = (a, b) => {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = text => {
    const counts = new Map()
    for (let i = 0; i < text.length - 1; i++) {
      const pair = text.slice(i, i + 2)
      counts.set(pair, (counts.get(pair) ?? 0) + 1)
    }
    return counts
  }
  const left = bigrams(a)
  const right = bigrams(b)
  let shared = 0
  for (const [pair, count] of left) shared += Math.min(count, right.get(pair) ?? 0)
  return (2 * shared) / (a.length - 1 + b.length - 1)
}

const SIMILARITY_FLOOR = 0.8

const loadWorks = () => {
  const works = []
  for (const file of readdirSync(WORKS_DIR)) {
    const doc = parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8'))
    for (const work of doc.works) works.push(work)
  }
  // The same programme appears on every season page it ran in.
  const byTagId = new Map()
  for (const work of works) {
    const existing = byTagId.get(work.workTagId)
    if (!existing) byTagId.set(work.workTagId, work)
    else existing.cours = [...new Set([...existing.cours, ...work.cours])].sort()
  }
  return [...byTagId.values()]
}

const main = async () => {
  const works = loadWorks()
  const byExact = new Map()
  const bySeriesKey = new Map()
  const bySeriesTag = new Map()

  for (const work of works) {
    const exact = normalize(work.title)
    if (!byExact.has(exact)) byExact.set(exact, [])
    byExact.get(exact).push(work)

    const key = seriesKey(work.title)
    if (!bySeriesKey.has(key)) bySeriesKey.set(key, [])
    bySeriesKey.get(key).push(work)

    if (work.seriesTagId) {
      if (!bySeriesTag.has(work.seriesTagId)) bySeriesTag.set(work.seriesTagId, [])
      bySeriesTag.get(work.seriesTagId).push(work)
    }
  }

  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`DB: ${animes.size}件 / animatetimes: ${works.length}番組\n`)

  const unmatched = []
  const similarityNotes = []
  let exactHits = 0
  let seriesHits = 0

  for (const anime of animes.docs) {
    const name = anime.get('name')?.ja ?? ''
    const exact = byExact.get(normalize(name)) ?? []
    const key = seriesKey(name)
    const viaKey = bySeriesKey.get(key) ?? []

    // Only when nothing matched outright, so a near miss never displaces a
    // title that agrees exactly.
    let viaSimilarity = []
    if (exact.length === 0 && viaKey.length === 0) {
      const target = normalize(name)
      const ranked = works
        .map(work => ({ work, score: similarity(target, normalize(work.title)) }))
        .filter(entry => entry.score >= SIMILARITY_FLOOR)
        .sort((a, b) => b.score - a.score)
      if (ranked.length) {
        viaSimilarity = [ranked[0].work]
        similarityNotes.push({
          name,
          match: ranked[0].work.title,
          score: ranked[0].score,
          workTagId: ranked[0].work.workTagId,
        })
      }
    }

    // Reach the rest of the series through whatever tag id the matches carry.
    const tagIds = new Set([...exact, ...viaKey, ...viaSimilarity].map(w => w.seriesTagId).filter(Boolean))
    const viaTag = [...tagIds].flatMap(id => bySeriesTag.get(id) ?? [])

    const all = [...new Map([...exact, ...viaKey, ...viaSimilarity, ...viaTag].map(w => [w.workTagId, w])).values()]
    all.sort((a, b) => (a.cours[0] ?? '').localeCompare(b.cours[0] ?? ''))

    if (all.length === 0) {
      unmatched.push({ id: anime.id, name, cours: anime.get('cours') ?? [] })
      continue
    }
    if (exact.length) exactHits++
    else seriesHits++

    if (!showAll) continue

    console.log(`=== ${anime.id}  ${name}`)
    console.log(`  DB cours: ${JSON.stringify((anime.get('cours') ?? []).filter(Boolean))}`)
    console.log(`  シリーズID: ${[...tagIds].join(',') || '(なし)'}`)
    for (const work of all) {
      console.log(
        `    ${(work.cours.join(',') || '-').padEnd(18)}work=${String(work.workTagId).padEnd(6)}${work.title}  [${work.format ?? '?'}]`
      )
    }
    console.log()
  }

  console.log(`完全一致: ${exactHits}件 / 別経路で一致: ${seriesHits}件 / 未一致: ${unmatched.length}件`)
  if (similarityNotes.length) {
    console.log('\n=== 類似度で一致（要確認） ===')
    similarityNotes.forEach(n => {
      console.log(`  ${n.score.toFixed(3)}  DB : ${n.name}`)
      console.log(`         site: ${n.match}  [work ${n.workTagId}]`)
    })
  }
  if (unmatched.length) {
    console.log('\n=== 未一致 ===')
    unmatched.forEach(u => console.log(`  ${u.id}  ${u.name}  cours=${JSON.stringify(u.cours.filter(Boolean))}`))
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
