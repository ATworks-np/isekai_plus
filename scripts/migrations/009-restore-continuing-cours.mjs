#!/usr/bin/env node
/**
 * Puts back the second quarter of a two cour run that the source omits.
 *
 *   node scripts/migrations/009-restore-continuing-cours.mjs           # dry run
 *   node scripts/migrations/009-restore-continuing-cours.mjs --apply   # writes
 *
 * animatetimes lists a continuing broadcast only under the quarter it started
 * in, so rebuilding seasons from it drops the back half. Re:ゼロ's 4th season
 * ran 2026-Q2 into Q3, which is the quarter airing now — losing it takes the
 * work out of the current-season filter entirely.
 *
 * Restores are listed rather than inferred. A missing continuation and a wrong
 * date look identical in the data: both are a database cour with no source
 * entry, sitting next to one that has it.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const apply = process.argv.includes('--apply')

const RESTORES = [
  {
    animeId: 'yUgDDHQqPK2e7anRzxTz',
    name: 'Re:ゼロから始める異世界生活',
    seasonCour: '2026-Q2', // 4th season
    add: '2026-Q3',
  },
  {
    animeId: 'H2NSrWWObImwUEel0OJZ',
    name: '葬送のフリーレン',
    seasonCour: '2023-Q4', // 第1期
    add: '2024-Q1',
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

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}\n`)

  for (const restore of RESTORES) {
    const ref = db.doc(`${ANIMES_PATH}/${restore.animeId}`)
    const anime = await ref.get()
    if (!anime.exists) {
      console.log(`SKIP ${restore.name}: レコードなし\n`)
      continue
    }

    const seasons = await ref.collection('seasons').orderBy('order').get()
    const target = seasons.docs.find(season =>
      (season.get('cours') ?? []).includes(restore.seasonCour)
    )
    if (!target) {
      console.log(`SKIP ${restore.name}: ${restore.seasonCour} を含む期が見つかりません\n`)
      continue
    }

    const seasonCours = [...new Set([...(target.get('cours') ?? []), restore.add])].sort()
    const seriesCours = [
      ...new Set(
        seasons.docs.flatMap(season =>
          season.id === target.id ? seasonCours : (season.get('cours') ?? [])
        )
      ),
    ].sort()

    console.log(`=== ${restore.name}`)
    console.log(`  ${target.get('label')}: ${JSON.stringify(target.get('cours'))} -> ${JSON.stringify(seasonCours)}`)
    console.log(`  シリーズ cours: ${JSON.stringify((anime.get('cours') ?? []).sort())} -> ${JSON.stringify(seriesCours)}`)
    console.log()

    if (!apply) continue
    await target.ref.update({ cours: seasonCours })
    await ref.update({ cours: seriesCours })
  }

  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
