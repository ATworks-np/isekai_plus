#!/usr/bin/env node
/**
 * Backfills seasonId on comments written before the seasons model.
 *
 *   node scripts/migrations/004-comment-seasons.mjs           # dry run
 *   node scripts/migrations/004-comment-seasons.mjs --apply   # writes
 *
 * A comment carries no season of its own, but it does carry createdAt, and a
 * season carries the cours it aired in. When the quarter a comment was written
 * in matches exactly one of the series' seasons, that is the season the reader
 * had open. Anything ambiguous is reported and left alone rather than guessed —
 * a wrong label is worse than no label.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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

const quarterOf = date => `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`

const main = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'dry-run'} | animes: ${animes.size}\n`)

  let total = 0
  let matched = 0
  let skipped = 0

  for (const anime of animes.docs) {
    const comments = await anime.ref.collection('comments').get()
    if (comments.empty) continue

    const seasons = await anime.ref.collection('seasons').get()
    const name = anime.get('name')?.ja ?? ''

    for (const comment of comments.docs) {
      total++
      if (comment.get('seasonId')) continue

      const createdAt = comment.get('createdAt')
      if (!createdAt?.toDate) {
        skipped++
        console.log(`SKIP  ${name} / ${comment.id}: no usable createdAt`)
        continue
      }

      const quarter = quarterOf(createdAt.toDate())
      // A one season series leaves nothing to disambiguate: whenever the comment
      // was written, it is about the only season there is. Most of the backlog
      // is this case — people commenting long after a show finished airing.
      let candidates =
        seasons.size === 1
          ? seasons.docs
          : seasons.docs.filter(season => (season.get('cours') ?? []).includes(quarter))

      if (candidates.length === 0 && seasons.size > 1) {
        // Written between broadcasts. A season that had not aired yet cannot be
        // what the comment is about, so it belongs to the most recent one that
        // had already started. YYYY-QN sorts correctly as a string.
        const aired = seasons.docs
          .map(season => ({
            season,
            start: [...(season.get('cours') ?? [])].sort()[0],
          }))
          .filter(entry => entry.start && entry.start <= quarter)
          .sort((a, b) => (a.start < b.start ? -1 : 1))

        if (aired.length) candidates = [aired[aired.length - 1].season]
      }

      if (candidates.length !== 1) {
        skipped++
        console.log(
          `SKIP  ${name} / ${comment.id}: written ${quarter}, matched ${candidates.length} seasons` +
            (seasons.size ? ` (seasons: ${seasons.docs.map(s => `${s.get('label')}=${JSON.stringify(s.get('cours'))}`).join(' ')})` : ' (no seasons)')
        )
        continue
      }

      const season = candidates[0]
      matched++
      console.log(
        `MATCH ${name} / ${comment.id}: written ${quarter} -> ${season.id} (${season.get('label')})`
      )
      console.log(`         "${comment.get('comment') ?? ''}"`)

      if (apply) await comment.ref.update({ seasonId: season.id })
    }
  }

  console.log(`\ncomments: ${total} | matched: ${matched} | left alone: ${skipped}`)
  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
