#!/usr/bin/env node
/**
 * Rebuilds a work's seasons from the animatetimes entries that belong to it.
 *
 *   node scripts/migrations/008-seasons-from-source.mjs           # proposal for works that need one
 *   node scripts/migrations/008-seasons-from-source.mjs --all     # proposal for every work
 *   node scripts/migrations/008-seasons-from-source.mjs --apply   # writes
 *
 * Each source entry is one broadcast, so it is one season, and its cours come
 * from the page rather than from guessing which quarters a run spanned. The
 * record's own metadata.animatetimes.workTagId anchors it; siblings are found
 * through the series tag in either direction, since the tag is stamped on
 * sequels and points back at the entry the series is named after.
 *
 * Existing ratings are assigned to a season by when they were submitted, with
 * the rules 004 used for comments. Timestamps come from the legacy ratings
 * tree, which still holds them.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, readdirSync } from 'fs'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const RATING_KEYS = ['story', 'character', 'animation', 'message', 'worldview']
const ANIMES_PATH = 'versions/1/animes'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
const RERUN = /(再放送|総集編|新編集版|再編集版|ダイジェスト)/

/**
 * Side stories, by animatetimes work id.
 *
 * Nothing in a title separates these from a sequel that happens to be
 * subtitled rather than numbered: 最果てのパラディン 鉄錆の山の王 and
 * マッシュル 神覚者候補選抜試験編 are second seasons, 転スラ日記 is not, and all
 * three read as "series title plus subtitle". So they are listed.
 *
 * `spinoff` is recorded on the series and sits out the 第N期 numbering, keeping
 * the numbers matching what the works are actually called. `drop` is not
 * recorded at all.
 */
const SPINOFFS = {
  15487: 'spinoff', // この素晴らしい世界に爆焔を！
  13298: 'drop', // 転スラ日記
  19789: 'drop', // 転生したらスライムだった件 コリウスの夢
  14716: 'drop', // Re:ゼロから始める休憩時間
}

/**
 * Records whose cours were corrected by hand after a rebuild. The source lists
 * a continuing broadcast only under the quarter it started in, so rebuilding
 * these would drop the restored quarter again — Re:ゼロ's 4th season runs into
 * 2026-Q3, which is the quarter airing now.
 */
const SKIP = new Set([
  'yUgDDHQqPK2e7anRzxTz', // Re:ゼロから始める異世界生活
  'H2NSrWWObImwUEel0OJZ', // 葬送のフリーレン
])

const apply = process.argv.includes('--apply')
const showAll = process.argv.includes('--all')

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
const courIndex = cour => {
  const m = /^(\d{4})-Q([1-4])$/.exec(cour)
  return m ? Number(m[1]) * 4 + (Number(m[2]) - 1) : null
}
const quarterOfDate = date => date.getFullYear() * 4 + Math.floor(date.getMonth() / 3)

const loadWorks = () => {
  const byTagId = new Map()
  for (const file of readdirSync(WORKS_DIR)) {
    for (const work of parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8')).works) {
      const existing = byTagId.get(work.workTagId)
      if (!existing) byTagId.set(work.workTagId, { ...work })
      else existing.cours = [...new Set([...existing.cours, ...work.cours])].sort()
    }
  }
  return byTagId
}

/** Every source entry belonging to the same series as `anchor`. */
const siblingsOf = (anchor, byTagId) => {
  const all = [...byTagId.values()]
  const ids = new Set([anchor.workTagId])
  // The series tag names one entry; sequels carry it.
  if (anchor.seriesTagId) {
    ids.add(anchor.seriesTagId)
    all.filter(w => w.seriesTagId === anchor.seriesTagId).forEach(w => ids.add(w.workTagId))
  }
  all.filter(w => w.seriesTagId === anchor.workTagId).forEach(w => ids.add(w.workTagId))

  // A sibling reached this way may carry a series tag the anchor lacked.
  for (const id of [...ids]) {
    const work = byTagId.get(id)
    if (!work?.seriesTagId) continue
    ids.add(work.seriesTagId)
    all.filter(w => w.seriesTagId === work.seriesTagId).forEach(w => ids.add(w.workTagId))
  }

  return [...ids]
    .map(id => byTagId.get(id))
    .filter(Boolean)
    .filter(work => !RERUN.test(work.title) && !RERUN.test(work.format ?? ''))
    .filter(work => work.cours.length)
    .filter(work => SPINOFFS[work.workTagId] !== 'drop')
    .sort((a, b) => a.cours[0].localeCompare(b.cours[0]))
}

const legacyTimestamps = async animeRef => {
  const byUser = new Map()
  for (const key of RATING_KEYS) {
    const snapshot = await animeRef.collection('ratings').doc(key).collection('userRatings').get()
    for (const doc of snapshot.docs) {
      const stamp = doc.get('createdAt')?.toDate?.() ?? doc.get('updatedAt')?.toDate?.() ?? null
      if (!stamp) continue
      const existing = byUser.get(doc.id)
      if (!existing || stamp < existing) byUser.set(doc.id, stamp)
    }
  }
  return byUser
}

const assignSeason = (seasons, quarter) => {
  const during = seasons.findIndex(season =>
    season.cours.some(cour => courIndex(cour) === quarter)
  )
  if (during !== -1) return { index: during, confidence: 'during' }

  const started = seasons
    .map((season, i) => ({ i, start: courIndex(season.cours[0]) }))
    .filter(entry => entry.start !== null && entry.start <= quarter)
  if (started.length) return { index: started[started.length - 1].i, confidence: 'after' }

  return { index: 0, confidence: 'before' }
}

const main = async () => {
  const byTagId = loadWorks()
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'proposal'} | DB ${animes.size}件\n`)

  let changed = 0
  const tally = { during: 0, after: 0, before: 0, undated: 0 }

  for (const anime of animes.docs) {
    if (SKIP.has(anime.id)) continue
    const tagId = anime.get('metadata.animatetimes.workTagId')
    const anchor = tagId ? byTagId.get(tagId) : null
    if (!anchor) continue

    const siblings = siblingsOf(anchor, byTagId)
    if (!siblings.length) continue

    // Spinoffs keep their place in broadcast order but sit out the numbering,
    // so 第3期 stays the thing actually called 第3期.
    let number = 0
    const seasons = siblings.map((work, i) => {
      const isSpinoff = SPINOFFS[work.workTagId] === 'spinoff'
      if (!isSpinoff) number++
      return {
        order: i + 1,
        label: isSpinoff ? work.title : `第${number}期`,
        kind: isSpinoff ? 'spinoff' : 'season',
        cours: work.cours,
        workTagId: work.workTagId,
        title: work.title,
      }
    })

    const existing = await anime.ref.collection('seasons').get()
    const dbCours = [...new Set((anime.get('cours') ?? []).filter(Boolean))].sort()
    const siteCours = [...new Set(seasons.flatMap(s => s.cours))].sort()

    const needsChange =
      existing.size !== seasons.length || JSON.stringify(dbCours) !== JSON.stringify(siteCours)
    if (!needsChange && !showAll) continue
    changed++

    const name = anime.get('name')?.ja ?? ''
    console.log(`=== ${anime.id}  ${name}`)
    console.log(`  cours: ${JSON.stringify(dbCours)} -> ${JSON.stringify(siteCours)}`)
    console.log(`  期: ${existing.size} -> ${seasons.length}`)

    // Collect every rater currently recorded, wherever they sit today.
    const raters = new Map()
    for (const season of existing.docs) {
      for (const user of (await season.ref.collection('userRatings').get()).docs) {
        raters.set(user.id, Object.fromEntries(RATING_KEYS.map(k => [k, user.get(k) ?? 0])))
      }
    }
    const stamps = await legacyTimestamps(anime.ref)

    const buckets = seasons.map(() => new Map())
    for (const [uid, ratings] of raters) {
      const stamp = stamps.get(uid)
      if (!stamp) {
        tally.undated++
        buckets[0].set(uid, ratings)
        continue
      }
      const { index, confidence } = assignSeason(seasons, quarterOfDate(stamp))
      tally[confidence]++
      buckets[index].set(uid, ratings)
    }

    seasons.forEach((season, i) => {
      console.log(
        `    ${season.label.padEnd(10)}${JSON.stringify(season.cours).padEnd(24)}評価${buckets[i].size}件  ${season.kind === 'spinoff' ? '[スピンオフ] ' : ''}work=${season.workTagId}`
      )
      console.log(`         "${season.title}"`)
    })
    console.log()

    if (!apply) continue

    for (const season of existing.docs) await db.recursiveDelete(season.ref)

    const summaries = []
    for (const [i, season] of seasons.entries()) {
      const bucket = buckets[i]
      const totals = zero()
      for (const ratings of bucket.values()) {
        for (const key of RATING_KEYS) totals[key] += ratings[key] ?? 0
      }
      const count = bucket.size
      const averages = Object.fromEntries(
        RATING_KEYS.map(key => [key, count ? totals[key] / count : 0])
      )

      const ref = anime.ref.collection('seasons').doc(`season-${season.order}`)
      const batch = db.batch()
      batch.set(ref, {
        order: season.order,
        label: season.label,
        kind: season.kind,
        cours: season.cours,
        programId: null,
        metadata: { animatetimes: { workTagId: season.workTagId } },
        ratingCount: count,
        ratingTotals: totals,
        ratings: averages,
      })
      for (const [uid, ratings] of bucket) {
        batch.set(ref.collection('userRatings').doc(uid), ratings)
      }
      await batch.commit()
      summaries.push({ ratingCount: count, ratings: averages })
    }

    const rated = summaries.filter(s => s.ratingCount >= 1)
    const fields = {}
    for (const key of RATING_KEYS) {
      fields[`${key}Rating`] = rated.length
        ? rated.reduce((sum, s) => sum + (s.ratings[key] ?? 0), 0) / rated.length
        : 0
    }
    await anime.ref.update({ ...fields, cours: siteCours })
  }

  console.log(`\n対象: ${changed}件`)
  console.log(`評価の割り当て: 放送中=${tally.during} 放送後=${tally.after} 放送前=${tally.before} 日時なし=${tally.undated}`)
  if (!apply) console.log('\nnothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
