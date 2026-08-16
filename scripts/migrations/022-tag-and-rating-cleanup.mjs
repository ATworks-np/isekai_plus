#!/usr/bin/env node
/**
 * Clears out four things the tag work would otherwise be built on top of.
 *
 *   node scripts/migrations/022-tag-and-rating-cleanup.mjs            # report only
 *   node scripts/migrations/022-tag-and-rating-cleanup.mjs --apply    # write
 *
 * 1. References to tags that no longer exist. Twelve works point at two tag
 *    documents that were deleted from the picker, which used to offer a delete
 *    button to everyone and removed the tag without unpicking the works first.
 *    Eleven of them share one id and are all 勇者/魔王 works, so the tag was one
 *    of those; the name is gone with the document, and the works get the
 *    concept back during the re-tagging rather than by guesswork here.
 *
 * 2. The two アルケミスト tags, which differ only in the width of their
 *    parentheses. The half-width one is on nothing and goes.
 *
 * 3. One user rating that scored a single axis and stored zero for the other
 *    four, from before the form required all five. It is the only one — 101 of
 *    the 102 rated works are unaffected — and it drags its work to 0.8 of 5.
 *
 * 4. The per-work ratings subcollection the seasons replaced. Ratings are
 *    recorded per season now; these are read by nothing.
 *
 * Everything removed is written to .backup/ first, as JSON, keyed by the path
 * it came from. Nothing here can be undone from Firestore itself.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const TAGS_PATH = 'versions/1/tags'
const BACKUP_DIR = '.backup'

const DUPLICATE_TAG_ID = 'gjspROkyojCNKNxd6JtC' // アルケミスト(薬師), half-width
const KEPT_TAG_ID = 'Kr1hyRuPIDn42PofZ1OQ' // アルケミスト（薬師）, full-width
const RATING_KEYS = ['story', 'character', 'animation', 'message', 'worldview']

const readEnv = file =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line.includes('='))
      .map(line => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )

const env = readEnv('.env')
initializeApp({ credential: applicationDefault(), projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
const db = getFirestore()

const apply = process.argv.includes('--apply')
const backup = {}
const keep = (path, data) => {
  backup[path] = data
}

/** Tag references pointing at a document that is not there any more. */
const findOrphanRefs = async (works, tagIds) => {
  const orphans = []
  for (const work of works) {
    const refs = (work.get('tags') ?? []).filter(Boolean)
    const dead = refs.filter(ref => !tagIds.has(ref.id))
    if (dead.length) {
      orphans.push({ work, dead })
      keep(`${ANIMES_PATH}/${work.id}#tags`, {
        name: work.get('name')?.ja ?? '',
        tags: refs.map(ref => ref.path),
      })
    }
  }
  return orphans
}

/** Ratings that scored some axes and left others at zero. */
const findPartialRatings = async works => {
  const partial = []
  for (const work of works) {
    const seasons = await db.collection(`${ANIMES_PATH}/${work.id}/seasons`).get()
    for (const season of seasons.docs) {
      const userRatings = await db
        .collection(`${ANIMES_PATH}/${work.id}/seasons/${season.id}/userRatings`)
        .get()
      for (const rating of userRatings.docs) {
        const scores = rating.get('ratings') ?? rating.data()
        const values = ['story', 'character', 'animation', 'message', 'worldview'].map(
          key => scores?.[key] ?? 0
        )
        if (values.some(v => v === 0) && values.some(v => v > 0)) {
          partial.push({ work, season, rating, values })
          keep(rating.ref.path, { name: work.get('name')?.ja ?? '', ...rating.data() })
        }
      }
    }
  }
  return partial
}

/** The per-work ratings the per-season ones replaced. */
const findLegacyRatings = async works => {
  const legacy = []
  for (const work of works) {
    const docs = await db.collection(`${ANIMES_PATH}/${work.id}/ratings`).get()
    for (const doc of docs.docs) {
      legacy.push(doc)
      keep(doc.ref.path, doc.data())
    }
  }
  return legacy
}

const main = async () => {
  const [worksSnap, tagsSnap] = await Promise.all([
    db.collection(ANIMES_PATH).get(),
    db.collection(TAGS_PATH).get(),
  ])
  const works = worksSnap.docs
  const tagIds = new Set(tagsSnap.docs.map(doc => doc.id))
  const tagName = id => tagsSnap.docs.find(doc => doc.id === id)?.get('name')?.ja ?? '(不明)'

  console.log(`作品 ${works.length}件 / タグ ${tagIds.size}件\n`)

  // 1. orphan references
  const orphans = await findOrphanRefs(works, tagIds)
  const deadIds = [...new Set(orphans.flatMap(o => o.dead.map(ref => ref.id)))]
  console.log(`【1】存在しないタグへの参照: ${orphans.length}作品 / タグ${deadIds.length}種`)
  for (const id of deadIds) {
    const affected = orphans.filter(o => o.dead.some(ref => ref.id === id))
    console.log(`  ${id} → ${affected.length}作品`)
    affected.slice(0, 4).forEach(o => console.log(`      ${o.work.get('name')?.ja}`))
    if (affected.length > 4) console.log(`      …ほか${affected.length - 4}件`)
  }

  // 2. duplicate tag
  const duplicate = tagsSnap.docs.find(doc => doc.id === DUPLICATE_TAG_ID)
  const usingDuplicate = works.filter(w =>
    (w.get('tags') ?? []).some(ref => ref.id === DUPLICATE_TAG_ID)
  )
  console.log(`\n【2】重複タグ: ${duplicate ? duplicate.get('name')?.ja : '(既に無い)'}`)
  console.log(`  残す: ${tagName(KEPT_TAG_ID)} (${KEPT_TAG_ID})`)
  console.log(`  消す: ${DUPLICATE_TAG_ID} — 参照している作品 ${usingDuplicate.length}件`)
  if (duplicate) keep(duplicate.ref.path, duplicate.data())

  // 3. partial ratings
  const partial = await findPartialRatings(works)
  console.log(`\n【3】一部の軸だけ点が入った評価: ${partial.length}件`)
  partial.forEach(p =>
    console.log(`  ${p.work.get('name')?.ja} / ${p.season.id} / ${p.rating.id} → ${p.values.join(',')}`)
  )

  // 4. legacy ratings
  const legacy = await findLegacyRatings(works)
  console.log(`\n【4】期に置き換わった旧評価: ${legacy.length}件`)

  if (!apply) {
    console.log(`\n控えに入るもの ${Object.keys(backup).length}件`)
    console.log('報告のみ。書き込むには --apply')
    return
  }

  // Written only on the run that deletes, and never over a file that is already
  // there. A second, read-only run finds nothing left to remove, and writing
  // that empty result would replace the copy the first run made — which is the
  // one moment the copy matters.
  mkdirSync(BACKUP_DIR, { recursive: true })
  const file = `${BACKUP_DIR}/022-${process.env.BACKUP_STAMP ?? 'cleanup'}.json`
  if (existsSync(file)) {
    throw new Error(`${file} が既にあります。BACKUP_STAMP で別名を指定してください。`)
  }
  writeFileSync(file, JSON.stringify(backup, null, 2))
  console.log(`\n控え ${Object.keys(backup).length}件 → ${file}`)

  console.log('\n書き込み中…')

  for (const { work, dead } of orphans) {
    await work.ref.update({ tags: FieldValue.arrayRemove(...dead.map(ref => ref)) })
  }
  console.log(`  参照を除去: ${orphans.length}作品`)

  if (duplicate) {
    for (const work of usingDuplicate) {
      await work.ref.update({
        tags: FieldValue.arrayRemove(db.doc(`${TAGS_PATH}/${DUPLICATE_TAG_ID}`)),
      })
      await work.ref.update({
        tags: FieldValue.arrayUnion(db.doc(`${TAGS_PATH}/${KEPT_TAG_ID}`)),
      })
    }
    await duplicate.ref.delete()
    console.log(`  重複タグを削除、${usingDuplicate.length}作品を付け替え`)
  }

  for (const { rating } of partial) {
    await rating.ref.delete()
  }
  console.log(`  壊れた評価を削除: ${partial.length}件`)

  // A season's average is stored, not derived, so removing the rating behind it
  // leaves the old number in place. Both the season and the series it belongs to
  // are rebuilt from what is left rather than by subtracting the deleted score,
  // so a second run cannot drift them.
  for (const seriesId of new Set(partial.map(p => p.work.id))) {
    const seasons = await db.collection(`${ANIMES_PATH}/${seriesId}/seasons`).get()
    const aggregates = []

    for (const season of seasons.docs) {
      const userRatings = await db
        .collection(`${ANIMES_PATH}/${seriesId}/seasons/${season.id}/userRatings`)
        .get()
      const totals = Object.fromEntries(RATING_KEYS.map(key => [key, 0]))
      for (const doc of userRatings.docs) {
        const scores = doc.get('ratings') ?? doc.data()
        for (const key of RATING_KEYS) totals[key] += scores?.[key] ?? 0
      }
      const ratingCount = userRatings.size
      const ratings = Object.fromEntries(
        RATING_KEYS.map(key => [key, ratingCount ? totals[key] / ratingCount : 0])
      )
      await season.ref.set({ ratingTotals: totals, ratingCount, ratings }, { merge: true })
      aggregates.push({ ratingCount, ratings })
    }

    const rated = aggregates.filter(season => season.ratingCount >= 1)
    const fields = {}
    for (const key of RATING_KEYS) {
      fields[`${key}Rating`] = rated.length
        ? rated.reduce((sum, season) => sum + (season.ratings?.[key] ?? 0), 0) / rated.length
        : 0
    }
    fields.ratingAverage =
      RATING_KEYS.reduce((sum, key) => sum + fields[`${key}Rating`], 0) / RATING_KEYS.length

    await db.doc(`${ANIMES_PATH}/${seriesId}`).set(fields, { merge: true })
    console.log(`  集計を再計算: ${seriesId} → 総合 ${fields.ratingAverage.toFixed(2)}`)
  }

  for (const doc of legacy) {
    await doc.ref.delete()
  }
  console.log(`  旧評価を削除: ${legacy.length}件`)

  console.log('\n完了。評価の集計は次の書き込みで作り直される。')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
