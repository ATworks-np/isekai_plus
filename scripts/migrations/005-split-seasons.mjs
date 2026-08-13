#!/usr/bin/env node
/**
 * Splits a season document that is really several broadcasts into one season
 * each, and distributes the existing ratings between them by when they were
 * submitted.
 *
 *   node scripts/migrations/005-split-seasons.mjs           # dry run + confidence report
 *   node scripts/migrations/005-split-seasons.mjs --apply   # writes
 *
 * Adjacent cours are one continuous run; a gap means a separate broadcast.
 *
 * Ratings are assigned with the rules 004 used for comments, but they deserve
 * less trust: a comment says what it is about, a rating is five numbers. The
 * dry run splits the assignments by confidence so the guessing is visible
 * before anything is written.
 *
 *   during  - submitted while that season was airing. Solid.
 *   after   - submitted after every season had aired; goes to the latest one.
 *             Plausible but unprovable — the rater may have meant the series.
 *   before  - submitted before anything aired. Should not happen; reported.
 *
 * Timestamps come from the legacy ratings tree, which still holds them: 001
 * copied the five values into the new per-user document and dropped createdAt
 * along the way. This also backfills them.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const RATING_KEYS = ['story', 'character', 'animation', 'message', 'worldview']
const ANIMES_PATH = 'versions/1/animes'
const apply = process.argv.includes('--apply')

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

const zero = () => Object.fromEntries(RATING_KEYS.map(key => [key, 0]))
const quarterIndex = cour => {
  const m = /^(\d{4})-Q([1-4])$/.exec(cour)
  return m ? Number(m[1]) * 4 + (Number(m[2]) - 1) : null
}
const courLabel = index => `${Math.floor(index / 4)}-Q${(index % 4) + 1}`
const quarterOfDate = date => date.getFullYear() * 4 + Math.floor(date.getMonth() / 3)

const runsOf = cours => {
  const indices = [...new Set(cours.map(quarterIndex).filter(i => i !== null))].sort((a, b) => a - b)
  const runs = []
  for (const index of indices) {
    const last = runs[runs.length - 1]
    if (last && index === last[last.length - 1] + 1) last.push(index)
    else runs.push([index])
  }
  return runs
}

/** Earliest createdAt this user recorded across the legacy per-axis documents. */
const legacyTimestamps = async animeRef => {
  const byUser = new Map()
  for (const key of RATING_KEYS) {
    const snapshot = await animeRef.collection('ratings').doc(key).collection('userRatings').get()
    for (const doc of snapshot.docs) {
      const created = doc.get('createdAt')?.toDate?.() ?? null
      const updated = doc.get('updatedAt')?.toDate?.() ?? null
      const existing = byUser.get(doc.id)
      const stamp = created ?? updated
      if (!stamp) continue
      if (!existing || stamp < existing.createdAt) {
        byUser.set(doc.id, { createdAt: stamp, updatedAt: updated ?? stamp })
      }
    }
  }
  return byUser
}

const assign = (runs, quarter) => {
  const during = runs.findIndex(run => run.includes(quarter))
  if (during !== -1) return { index: during, confidence: 'during' }

  const started = runs.map((run, i) => ({ i, start: run[0] })).filter(entry => entry.start <= quarter)
  if (started.length) return { index: started[started.length - 1].i, confidence: 'after' }

  return { index: 0, confidence: 'before' }
}

const main = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}\n`)

  const tally = { during: 0, after: 0, before: 0, undated: 0 }
  let worksSplit = 0

  for (const anime of animes.docs) {
    const seasons = await anime.ref.collection('seasons').get()
    if (seasons.size !== 1) continue

    const season = seasons.docs[0]
    const runs = runsOf(season.get('cours') ?? [])
    if (runs.length < 2) continue

    worksSplit++
    const name = anime.get('name')?.ja ?? ''
    console.log(`=== ${anime.id}  ${name}`)
    console.log(`  ${runs.length} 期に分割`)

    const stamps = await legacyTimestamps(anime.ref)
    const users = await season.ref.collection('userRatings').get()

    // buckets[i] = ratings assigned to run i
    const buckets = runs.map(() => new Map())

    for (const user of users.docs) {
      const entry = Object.fromEntries(RATING_KEYS.map(key => [key, user.get(key) ?? 0]))
      const stamp = stamps.get(user.id)

      if (!stamp) {
        tally.undated++
        buckets[0].set(user.id, { ...entry, createdAt: null, updatedAt: null, confidence: 'undated' })
        console.log(`    ${user.id}: 日時なし -> 第1期`)
        continue
      }

      const quarter = quarterOfDate(stamp.createdAt)
      const { index, confidence } = assign(runs, quarter)
      tally[confidence]++
      buckets[index].set(user.id, { ...entry, ...stamp, confidence })
      console.log(
        `    ${user.id}: ${stamp.createdAt.toISOString().slice(0, 10)} (${courLabel(quarter)}) -> 第${index + 1}期  [${confidence}]`
      )
    }

    runs.forEach((run, i) => {
      const span = run.length > 1 ? `${courLabel(run[0])}〜${courLabel(run[run.length - 1])}` : courLabel(run[0])
      console.log(`    第${i + 1}期 ${span}: 評価${buckets[i].size}件`)
    })
    console.log()

    if (!apply) continue

    const seasonSummaries = []
    for (let i = 0; i < runs.length; i++) {
      const cours = runs[i].map(courLabel)
      const raters = buckets[i]
      const totals = zero()
      for (const entry of raters.values()) for (const key of RATING_KEYS) totals[key] += entry[key] ?? 0
      const count = raters.size
      const ratings = Object.fromEntries(
        RATING_KEYS.map(key => [key, count ? totals[key] / count : 0])
      )

      const seasonId = `season-${i + 1}`
      const ref = anime.ref.collection('seasons').doc(seasonId)
      const batch = db.batch()

      batch.set(ref, {
        order: i + 1,
        label: `第${i + 1}期`,
        cours,
        programId: null,
        ratingCount: count,
        ratingTotals: totals,
        ratings,
      }, { merge: true })

      for (const [uid, entry] of raters) {
        const doc = { ...Object.fromEntries(RATING_KEYS.map(k => [k, entry[k] ?? 0])) }
        if (entry.createdAt) doc.createdAt = entry.createdAt
        if (entry.updatedAt) doc.updatedAt = entry.updatedAt
        doc.assignedBy = entry.confidence
        batch.set(ref.collection('userRatings').doc(uid), doc, { merge: true })
      }
      await batch.commit()

      // Raters that moved off season-1 must not stay behind on it.
      if (i > 0) {
        for (const uid of raters.keys()) {
          await season.ref.collection('userRatings').doc(uid).delete()
        }
      }
      seasonSummaries.push({ ratingCount: count, ratings })
    }

    const rated = seasonSummaries.filter(s => s.ratingCount >= 1)
    const fields = {}
    for (const key of RATING_KEYS) {
      fields[`${key}Rating`] = rated.length
        ? rated.reduce((sum, s) => sum + (s.ratings[key] ?? 0), 0) / rated.length
        : 0
    }
    await anime.ref.update(fields)
  }

  console.log(`\n分割対象: ${worksSplit}件`)
  console.log(`評価の割り当て: 放送中=${tally.during}  放送後=${tally.after}  放送前=${tally.before}  日時なし=${tally.undated}`)
  if (!apply) console.log('\nnothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
