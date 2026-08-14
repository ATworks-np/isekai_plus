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
  {
    animeId: null, // resolved by name below
    name: '帰還者の魔法は特別です',
    // 2026-Q3 is a rerun of season 1 ahead of the sequel, which Wikipedia and
    // the site's own news put in October — 2026-Q4. A rerun is not a broadcast
    // season: the current-season filter exists to show what is newly airing,
    // and a three year old show reappearing there defeats it.
    remove: ['2026-Q3'],
  },
  {
    name: '転生したらスライムだった件',
    seasonLabel: '第1期',
    // Ran 2018年10月1日 to 2019年3月25日, which is two cours; the site lists it
    // only under the quarter it started. 2022-Q2 is the same season repeated.
    remove: ['2022-Q2'],
    add: ['2019-Q1'],
  },
  {
    name: '本好きの下剋上 司書になるためには手段を選んでいられません',
    seasonLabel: '第3期',
    // 2026-Q1 is season 3 repeated ahead of season 4, per Wikipedia's MANPA
    // schedule. Season 3 itself ran April to June 2022.
    remove: ['2026-Q1'],
  },
  {
    name: '本好きの下剋上 司書になるためには手段を選んでいられません',
    seasonLabel: '第4期',
    // 領主の養女 started 2026年4月4日 as a continuous two cour run.
    add: ['2026-Q3'],
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

  const all = await db.collection(ANIMES_PATH).get()

  for (const correction of CORRECTIONS) {
    const found = correction.animeId
      ? all.docs.find(doc => doc.id === correction.animeId)
      : all.docs.find(doc => doc.get('name')?.ja === correction.name)
    const ref = found?.ref ?? db.doc(`${ANIMES_PATH}/${correction.animeId}`)
    const anime = found ?? (await ref.get())
    if (!anime.exists) {
      console.log(`SKIP ${correction.name}: レコードなし\n`)
      continue
    }

    const remove = correction.remove ?? []
    const add = correction.add ?? []
    const seasons = await ref.collection('seasons').orderBy('order').get()
    // A correction naming a season touches only that one; without a name it
    // applies to every season carrying the cour.
    const targets = correction.seasonLabel
      ? seasons.docs.filter(season => season.get('label') === correction.seasonLabel)
      : seasons.docs

    const seasonUpdates = targets
      .map(season => {
        const current = season.get('cours') ?? []
        const cours = [...new Set([...current.filter(c => !remove.includes(c)), ...add])].sort()
        return { season, cours }
      })
      .filter(({ season, cours }) => JSON.stringify(cours) !== JSON.stringify([...(season.get('cours') ?? [])].sort()))

    // The work's cours is the union of its seasons', so derive it rather than
    // patching it separately and letting the two disagree.
    const after = [
      ...new Set(
        seasons.docs.flatMap(season => {
          const update = seasonUpdates.find(u => u.season.id === season.id)
          return update ? update.cours : (season.get('cours') ?? [])
        })
      ),
    ].sort()

    console.log(`=== ${correction.name}${correction.seasonLabel ? ` / ${correction.seasonLabel}` : ''}`)
    console.log(`  cours: ${JSON.stringify([...(anime.get('cours') ?? [])].sort())} -> ${JSON.stringify(after)}`)
    console.log(`  latestCour: ${anime.get('latestCour')} -> ${latestCourOf(after)}`)
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
