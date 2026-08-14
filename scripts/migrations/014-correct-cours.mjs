#!/usr/bin/env node
/**
 * Removes cours a work never actually aired in.
 *
 *   node scripts/migrations/014-correct-cours.mjs           # dry run
 *   node scripts/migrations/014-correct-cours.mjs --apply   # writes
 *
 * animatetimes' 公開開始年＆季節 lists every season page a programme appears
 * on, not only the ones it aired in. A rerun, a sequel announcement or a
 * related article puts an old work on a new season's page, and importing that
 * field wholesale takes the extra quarter with it. The スケジュール field is
 * the one that says when it actually ran.
 *
 * Corrections are listed rather than derived: a work whose schedule shows one
 * cour may still have aired in two, since the site often records only the
 * first, and 無職転生 Ⅱ really did run across 2023-Q3 and 2024-Q2.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const apply = process.argv.includes('--apply')

const CORRECTIONS = [
  {
    animeId: 'Dds2OE7bidrGdcswMQVJ',
    name: '異世界でチート能力を手にした俺は、現実世界をも無双する ～レベルアップは人生を変えた～',
    // Schedule reads 2023年4月6日〜2023年6月29日; the 2026-Q2 listing is the
    // programme reappearing on a later season page, not a second broadcast.
    remove: ['2026-Q2'],
  },
]

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
  const valid = cours.filter(c => typeof c === 'string' && /^\d{4}-Q[1-4]$/.test(c))
  return valid.length ? valid.sort()[valid.length - 1] : null
}

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}\n`)

  for (const correction of CORRECTIONS) {
    const ref = db.doc(`${ANIMES_PATH}/${correction.animeId}`)
    const anime = await ref.get()
    if (!anime.exists) {
      console.log(`SKIP ${correction.name}: レコードなし\n`)
      continue
    }

    const seasons = await ref.collection('seasons').orderBy('order').get()
    const before = [...new Set((anime.get('cours') ?? []).filter(Boolean))].sort()
    const after = before.filter(cour => !correction.remove.includes(cour))

    console.log(`=== ${correction.name}`)
    console.log(`  cours: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
    console.log(`  latestCour: ${anime.get('latestCour')} -> ${latestCourOf(after)}`)

    const seasonUpdates = seasons.docs
      .map(season => {
        const cours = (season.get('cours') ?? []).filter(
          cour => !correction.remove.includes(cour)
        )
        return { season, cours }
      })
      .filter(({ season, cours }) => cours.length !== (season.get('cours') ?? []).length)

    seasonUpdates.forEach(({ season, cours }) =>
      console.log(
        `  ${season.get('label')}: ${JSON.stringify(season.get('cours'))} -> ${JSON.stringify(cours)}`
      )
    )
    console.log()

    if (!apply) continue

    for (const { season, cours } of seasonUpdates) await season.ref.update({ cours })
    await ref.update({ cours: after, latestCour: latestCourOf(after) })
  }

  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
