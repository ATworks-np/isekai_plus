#!/usr/bin/env node
/**
 * Stamps each work with its animatetimes ids and aligns its title to the
 * source's official name.
 *
 *   node scripts/migrations/007-animatetimes-metadata.mjs           # dry run
 *   node scripts/migrations/007-animatetimes-metadata.mjs --apply   # writes
 *
 * Writes metadata.animatetimes = { workTagId, seriesTagId } so later passes
 * identify a series by id instead of by guessing at its title, which is what
 * every earlier attempt spent itself on.
 *
 * A database record is a series, so its name follows the source's シリーズ field
 * when there is one — naming the record "Re:ゼロから始める異世界生活 4th season"
 * would label the whole series after one instalment.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, readdirSync } from 'fs'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
const SIMILARITY_FLOOR = 0.8
const apply = process.argv.includes('--apply')

/** Titles the source abbreviates differently enough that nothing links them. */
const OVERRIDES = {
  fF5Vqm3kls2he8Rm0DkH: 22919, // 魔王の俺がエルフを嫁にしたんだが -> 魔王の俺が奴隷エルフを嫁にしたんだが、どう愛でればいい？
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

const normalize = title =>
  title
    .normalize('NFKC')
    .replace(/[〜～~]/g, '~')
    .replace(/[“”„‟"]/g, '"')
    .replace(/[‘’‚‛']/g, "'")
    .replace(/[!！?？]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()

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

const loadWorks = () => {
  const byTagId = new Map()
  for (const file of readdirSync(WORKS_DIR)) {
    const doc = parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8'))
    for (const work of doc.works) {
      const existing = byTagId.get(work.workTagId)
      if (!existing) byTagId.set(work.workTagId, { ...work })
      else existing.cours = [...new Set([...existing.cours, ...work.cours])].sort()
    }
  }
  return [...byTagId.values()]
}

const main = async () => {
  const works = loadWorks()
  const byTagId = new Map(works.map(work => [work.workTagId, work]))
  const byExact = new Map()
  for (const work of works) {
    const key = normalize(work.title)
    if (!byExact.has(key)) byExact.set(key, work)
  }

  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'dry-run'} | DB ${animes.size}件\n`)

  let renamed = 0
  let stamped = 0
  const unmatched = []

  for (const anime of animes.docs) {
    const name = anime.get('name')?.ja ?? ''

    let match = OVERRIDES[anime.id] ? byTagId.get(OVERRIDES[anime.id]) : byExact.get(normalize(name))
    if (!match) {
      const target = normalize(name)
      const ranked = works
        .map(work => ({ work, score: similarity(target, normalize(work.title)) }))
        .filter(entry => entry.score >= SIMILARITY_FLOOR)
        .sort((a, b) => b.score - a.score)
      match = ranked[0]?.work
    }

    if (!match) {
      unmatched.push({ id: anime.id, name })
      continue
    }

    // Prefer the series name: the record stands for the whole series, and the
    // matched entry may be one instalment of it.
    const title = match.seriesTitle ?? match.title
    const metadata = {
      animatetimes: {
        workTagId: match.workTagId,
        seriesTagId: match.seriesTagId ?? null,
      },
    }

    const titleChanged = title !== name
    if (titleChanged) renamed++
    stamped++

    if (titleChanged) {
      console.log(`${anime.id}`)
      console.log(`  旧: ${name}`)
      console.log(`  新: ${title}`)
      console.log(`  work=${match.workTagId} series=${match.seriesTagId ?? '-'}`)
    }

    if (!apply) continue

    const update = { metadata }
    if (titleChanged) update.name = { ...(anime.get('name') ?? {}), ja: title }
    await anime.ref.set(update, { merge: true })
  }

  console.log(`\nmetadata 付与: ${stamped}件 / タイトル変更: ${renamed}件 / 未一致: ${unmatched.length}件`)
  unmatched.forEach(u => console.log(`  未一致: ${u.id}  ${u.name}`))
  if (!apply) console.log('\nnothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
