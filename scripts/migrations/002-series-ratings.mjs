#!/usr/bin/env node
/**
 * Recomputes every series' rating fields from its seasons.
 *
 *   node scripts/migrations/002-series-ratings.mjs           # dry run
 *   node scripts/migrations/002-series-ratings.mjs --apply   # writes
 *
 * Run this as part of step 4, when the legacy rating triggers are retired.
 * Until a work is rated again the series fields still hold whatever the old
 * trigger chain last wrote, including the drift 001 surfaced — the new
 * transaction only recomputes a series when someone rates it.
 *
 * Same rule as the runtime: the series score is the plain mean over seasons
 * that have at least one rating.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const RATING_KEYS = ['story', 'character', 'animation', 'message', 'worldview']
const ANIMES_PATH = 'versions/1/animes'
const MIN_RATINGS = 1

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

const main = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'dry-run'} | animes: ${animes.size}\n`)

  let changed = 0

  for (const anime of animes.docs) {
    const seasons = await anime.ref.collection('seasons').get()
    const rated = seasons.docs.filter(season => (season.get('ratingCount') ?? 0) >= MIN_RATINGS)

    const fields = {}
    for (const key of RATING_KEYS) {
      fields[`${key}Rating`] = rated.length
        ? rated.reduce((sum, season) => sum + ((season.get('ratings') ?? {})[key] ?? 0), 0) /
          rated.length
        : 0
    }

    const diffs = RATING_KEYS.filter(
      key => Math.abs((anime.get(`${key}Rating`) ?? 0) - fields[`${key}Rating`]) > 0.001
    )
    if (diffs.length === 0) continue

    changed++
    console.log(`${anime.id}  ${anime.get('name')?.ja ?? ''}`)
    for (const key of diffs) {
      console.log(
        `    ${key}: ${(anime.get(`${key}Rating`) ?? 0).toFixed(3)} -> ${fields[`${key}Rating`].toFixed(3)}`
      )
    }

    if (apply) await anime.ref.update(fields)
  }

  console.log(`\nseries needing correction: ${changed}`)
  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
