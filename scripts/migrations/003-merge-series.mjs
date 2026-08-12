#!/usr/bin/env node
/**
 * Folds a standalone sequel record into its series as another season.
 *
 *   node scripts/migrations/003-merge-series.mjs           # dry run
 *   node scripts/migrations/003-merge-series.mjs --apply   # writes
 *
 * Two works predate the seasons model and live as separate top level records
 * for their second season. Merging them used to mean deleting a record that
 * carries real ratings and comments; now the ratings have somewhere to go, so
 * the merge is lossless: the sequel's ratings become the target's next season,
 * its comments and likes move to the series, and only then is it removed.
 *
 * commentCount is deliberately not written here. Copying a comment fires
 * incrementCommentCount on the target, and setting the field as well would
 * race that trigger. Verify it afterwards with --verify.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const RATING_KEYS = ['story', 'character', 'animation', 'message', 'worldview']
const ANIMES_PATH = 'versions/1/animes'

/** Merges to perform, matched on exact name.ja. */
const MERGES = [
  { target: '葬送のフリーレン', source: '葬送のフリーレン 第2期', label: '第2期' },
  { target: '姫様“拷問”の時間です', source: '姫様“拷問”の時間です　第2期', label: '第2期' },
]

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

const findByName = (docs, name) => docs.find(doc => doc.get('name')?.ja === name)

const collectUserRatings = async animeRef => {
  const seasons = await animeRef.collection('seasons').get()
  const byUser = new Map()
  const cours = new Set()

  for (const season of seasons.docs) {
    ;(season.get('cours') ?? []).forEach(c => cours.add(c))
    const users = await season.ref.collection('userRatings').get()
    for (const user of users.docs) {
      const entry = byUser.get(user.id) ?? zero()
      for (const key of RATING_KEYS) entry[key] = user.get(key) ?? entry[key]
      byUser.set(user.id, entry)
    }
  }
  return { byUser, cours: [...cours] }
}

const aggregate = byUser => {
  const totals = zero()
  for (const entry of byUser.values()) for (const key of RATING_KEYS) totals[key] += entry[key] ?? 0
  const count = byUser.size
  const ratings = Object.fromEntries(
    RATING_KEYS.map(key => [key, count ? totals[key] / count : 0])
  )
  return { totals, count, ratings }
}

const seriesFieldsFrom = seasonDocs => {
  const rated = seasonDocs.filter(season => season.ratingCount >= 1)
  const fields = {}
  for (const key of RATING_KEYS) {
    fields[`${key}Rating`] = rated.length
      ? rated.reduce((sum, season) => sum + (season.ratings[key] ?? 0), 0) / rated.length
      : 0
  }
  return fields
}

const verify = async animes => {
  for (const { target, source } of MERGES) {
    const targetDoc = findByName(animes.docs, target)
    const sourceDoc = findByName(animes.docs, source)
    console.log(`\n=== ${target}`)
    if (!targetDoc) {
      console.log('  target MISSING')
      continue
    }
    console.log(`  source record still present: ${sourceDoc ? 'YES (' + sourceDoc.id + ')' : 'no'}`)
    console.log(`  cours=${JSON.stringify(targetDoc.get('cours'))}`)
    console.log(`  storedCommentCount=${targetDoc.get('commentCount') ?? 0}`)
    const comments = await targetDoc.ref.collection('comments').get()
    console.log(`  actualComments=${comments.size}`)
    const seasons = await targetDoc.ref.collection('seasons').orderBy('order').get()
    for (const season of seasons.docs) {
      const users = await season.ref.collection('userRatings').get()
      console.log(
        `  ${season.id}: order=${season.get('order')} label=${season.get('label')} cours=${JSON.stringify(season.get('cours'))} raters=${users.size} ratings=${JSON.stringify(season.get('ratings'))}`
      )
    }
    for (const key of RATING_KEYS) {
      console.log(`    ${key}Rating=${(targetDoc.get(`${key}Rating`) ?? 0).toFixed(3)}`)
    }
  }
}

const main = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${mode}\n`)

  if (mode === 'verify') return verify(animes)

  for (const merge of MERGES) {
    const targetDoc = findByName(animes.docs, merge.target)
    const sourceDoc = findByName(animes.docs, merge.source)

    console.log(`=== ${merge.source}  ->  ${merge.target}`)
    if (!targetDoc || !sourceDoc) {
      console.log(`  SKIP: ${!targetDoc ? 'target' : 'source'} not found\n`)
      continue
    }

    const { byUser, cours } = await collectUserRatings(sourceDoc.ref)
    const { totals, count, ratings } = aggregate(byUser)
    const comments = await sourceDoc.ref.collection('comments').get()
    const likes = await sourceDoc.ref.collection('likes').get()

    const existingSeasons = await targetDoc.ref.collection('seasons').get()
    const nextOrder =
      Math.max(0, ...existingSeasons.docs.map(season => season.get('order') ?? 0)) + 1
    const seasonId = `season-${nextOrder}`

    const mergedCours = [...new Set([...(targetDoc.get('cours') ?? []).filter(Boolean), ...cours])]

    console.log(`  target=${targetDoc.id}  source=${sourceDoc.id}`)
    console.log(`  new season: ${seasonId} order=${nextOrder} label=${merge.label} cours=${JSON.stringify(cours)}`)
    console.log(`  ratings moving: raters=${count} ratings=${JSON.stringify(ratings)}`)
    console.log(`  comments moving: ${comments.size}   likes moving: ${likes.size}`)
    console.log(`  target cours -> ${JSON.stringify(mergedCours)}`)

    if (mode !== 'apply') {
      console.log('  (dry run, nothing written)\n')
      continue
    }

    const seasonRef = targetDoc.ref.collection('seasons').doc(seasonId)
    const batch = db.batch()

    batch.set(seasonRef, {
      order: nextOrder,
      label: merge.label,
      cours,
      programId: null,
      ratingCount: count,
      ratingTotals: totals,
      ratings,
      mergedFrom: sourceDoc.id,
    })
    for (const [uid, entry] of byUser) {
      batch.set(seasonRef.collection('userRatings').doc(uid), entry)
    }
    for (const comment of comments.docs) {
      batch.set(targetDoc.ref.collection('comments').doc(comment.id), comment.data())
    }
    for (const like of likes.docs) {
      batch.set(targetDoc.ref.collection('likes').doc(like.id), like.data(), { merge: true })
    }
    batch.update(targetDoc.ref, { cours: mergedCours })
    await batch.commit()

    // Recompute the series mean now that the target has one more season.
    const seasonsAfter = await targetDoc.ref.collection('seasons').get()
    await targetDoc.ref.update(
      seriesFieldsFrom(
        seasonsAfter.docs.map(season => ({
          ratingCount: season.get('ratingCount') ?? 0,
          ratings: season.get('ratings') ?? zero(),
        }))
      )
    )

    await db.recursiveDelete(sourceDoc.ref)
    console.log('  merged and source deleted\n')
  }

  if (mode !== 'apply') console.log('nothing written (pass --apply to write)')
  else console.log('done. run with --verify to check commentCount settled.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
