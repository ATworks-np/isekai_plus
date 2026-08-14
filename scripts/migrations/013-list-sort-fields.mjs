#!/usr/bin/env node
/**
 * Backfills the fields the list orders by.
 *
 *   node scripts/migrations/013-list-sort-fields.mjs           # dry run
 *   node scripts/migrations/013-list-sort-fields.mjs --apply   # writes
 *
 * Firestore cannot order by the largest element of an array, count a
 * subcollection, or average five fields, so each becomes a stored scalar:
 *
 *   latestCour     newest cour the work aired in
 *   likeCount      size of the likes subcollection
 *   ratingAverage  mean of the five axis averages
 *
 * From here the write API keeps latestCour, the like endpoint keeps likeCount
 * and the rating transaction keeps ratingAverage.
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

const latestCourOf = cours => {
  const valid = (cours ?? []).filter(c => typeof c === 'string' && /^\d{4}-Q[1-4]$/.test(c))
  return valid.length ? valid.sort()[valid.length - 1] : null
}

const main = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'dry-run'} | 作品 ${animes.size}件\n`)

  let changed = 0

  for (const anime of animes.docs) {
    const likes = await anime.ref.collection('likes').get()
    const latestCour = latestCourOf(anime.get('cours'))
    const ratingAverage =
      RATING_KEYS.reduce((sum, key) => sum + (anime.get(`${key}Rating`) ?? 0), 0) /
      RATING_KEYS.length

    const patch = {}
    if (anime.get('latestCour') !== latestCour) patch.latestCour = latestCour
    if ((anime.get('likeCount') ?? null) !== likes.size) patch.likeCount = likes.size
    if (Math.abs((anime.get('ratingAverage') ?? -1) - ratingAverage) > 0.0001) {
      patch.ratingAverage = ratingAverage
    }
    if (Object.keys(patch).length === 0) continue

    changed++
    console.log(
      `  ${anime.get('name')?.ja ?? ''}  ${Object.entries(patch)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
        .join(' ')}`
    )
    if (apply) await anime.ref.set(patch, { merge: true })
  }

  console.log(`\n更新 ${changed}件 / 変更なし ${animes.size - changed}件`)
  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
