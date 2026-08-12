#!/usr/bin/env node
/**
 * Gives every existing anime a default season and copies its ratings into it.
 *
 *   node scripts/migrations/001-seasons.mjs            # dry run, writes nothing
 *   node scripts/migrations/001-seasons.mjs --apply    # writes
 *   node scripts/migrations/001-seasons.mjs --verify   # compares old vs new, writes nothing
 *
 * Nothing is deleted. The old versions/1/animes/<id>/ratings/** tree stays
 * exactly where it is, so the site keeps working throughout and a bad run is
 * undone by deleting the seasons subcollections.
 *
 * Requires application default credentials:
 *   gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const RATING_KEYS = ['story', 'character', 'animation', 'message', 'worldview']
const ANIMES_PATH = 'versions/1/animes'
const DEFAULT_SEASON_ID = 'season-1'

const mode = process.argv.includes('--apply')
  ? 'apply'
  : process.argv.includes('--verify')
    ? 'verify'
    : 'dry-run'

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

/** Rebuilds one anime's per-user ratings from the old ratings/<axis>/userRatings tree. */
const readLegacyRatings = async animeId => {
  const byUser = new Map()

  for (const key of RATING_KEYS) {
    const snapshot = await db
      .collection(`${ANIMES_PATH}/${animeId}/ratings/${key}/userRatings`)
      .get()
    for (const doc of snapshot.docs) {
      const entry = byUser.get(doc.id) ?? zero()
      entry[key] = doc.get('value') ?? 0
      byUser.set(doc.id, entry)
    }
  }

  return byUser
}

const aggregate = byUser => {
  const totals = zero()
  for (const entry of byUser.values()) {
    for (const key of RATING_KEYS) totals[key] += entry[key] ?? 0
  }
  const count = byUser.size
  const ratings = Object.fromEntries(
    RATING_KEYS.map(key => [key, count ? totals[key] / count : 0])
  )
  return { totals, count, ratings }
}

const main = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${mode} | animes: ${animes.size}\n`)

  let withRatings = 0
  let mismatches = 0
  let written = 0

  for (const anime of animes.docs) {
    const byUser = await readLegacyRatings(anime.id)
    const { totals, count, ratings } = aggregate(byUser)
    if (count > 0) withRatings++

    // With exactly one season the series mean equals that season's average, so
    // it must reproduce the value the old trigger chain already stored. Any gap
    // is a pre-existing aggregate drift and is worth seeing before cutover.
    const drift = RATING_KEYS.filter(key => {
      const before = anime.get(`${key}Rating`) ?? 0
      return Math.abs(before - ratings[key]) > 0.001
    })

    if (drift.length) {
      mismatches++
      console.log(`DRIFT  ${anime.id}  ${anime.get('name')?.ja ?? ''}`)
      for (const key of drift) {
        console.log(
          `         ${key}: stored=${(anime.get(`${key}Rating`) ?? 0).toFixed(3)} recomputed=${ratings[key].toFixed(3)} (raters=${count})`
        )
      }
    }

    if (mode !== 'apply') continue

    const seasonRef = db.doc(`${ANIMES_PATH}/${anime.id}/seasons/${DEFAULT_SEASON_ID}`)
    const batch = db.batch()

    batch.set(
      seasonRef,
      {
        order: 1,
        label: '第1期',
        cours: (anime.get('cours') ?? []).filter(Boolean),
        programId: null,
        ratingCount: count,
        ratingTotals: totals,
        ratings,
        migratedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    for (const [uid, entry] of byUser) {
      batch.set(seasonRef.collection('userRatings').doc(uid), {
        ...entry,
        migratedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }

    await batch.commit()
    written++
  }

  console.log(`\nanimes with ratings: ${withRatings}`)
  console.log(`aggregate drift found: ${mismatches}`)
  if (mode === 'apply') console.log(`seasons written: ${written}`)
  else console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
