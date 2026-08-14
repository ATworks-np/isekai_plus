#!/usr/bin/env node
/**
 * Removes cours and latestCour from the work documents.
 *
 *   node scripts/migrations/015-drop-anime-cours.mjs           # dry run
 *   node scripts/migrations/015-drop-anime-cours.mjs --apply   # writes
 *
 * A work carried a copy of the cours of its seasons, plus their maximum as a
 * sortable scalar, because Firestore can neither filter a collection by a
 * subcollection's field nor order by the largest element of an array. Keeping
 * the copy in step meant remembering to rewrite it after every season change,
 * and a repair that touched only the seasons left works missing from the list.
 * The API derives both from the seasons now.
 *
 * Run this after the readers are deployed — App Hosting and the read functions
 * both stop using the fields, and a work whose cours has been deleted while an
 * old reader is still serving would show as having never aired.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

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

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}\n`)

  const animes = await db.collection(ANIMES_PATH).get()
  const seasons = await db.collectionGroup('seasons').get()

  const byAnime = new Map()
  for (const season of seasons.docs) {
    const anime = season.ref.parent.parent
    if (!anime || anime.parent.path !== ANIMES_PATH) continue
    const cours = byAnime.get(anime.id) ?? new Set()
    for (const cour of season.get('cours') ?? []) cours.add(cour)
    byAnime.set(anime.id, cours)
  }

  // The seasons become the only record of when a work aired, so a work with
  // none would lose its cours entirely. There should be none of these.
  const orphans = animes.docs.filter(anime => !byAnime.has(anime.id))
  if (orphans.length) {
    console.log(`中止: 期を持たない作品が ${orphans.length}件あります`)
    orphans.forEach(anime => console.log(`  ${anime.get('name')?.ja} [${anime.id}]`))
    console.log('先に期を作ってから再実行してください')
    return
  }

  // A cour recorded only on the work would disappear with the field.
  const losing = animes.docs.filter(anime => {
    const stored = [...new Set((anime.get('cours') ?? []).filter(Boolean))].sort()
    const derived = [...byAnime.get(anime.id)].sort()
    return stored.some(cour => !derived.includes(cour))
  })
  if (losing.length) {
    console.log(`中止: 作品にしかないクールを持つ作品が ${losing.length}件あります`)
    losing.forEach(anime =>
      console.log(
        `  ${anime.get('name')?.ja}: ${JSON.stringify(anime.get('cours'))} vs ${JSON.stringify([
          ...byAnime.get(anime.id),
        ].sort())}`
      )
    )
    return
  }

  const targets = animes.docs.filter(
    anime => anime.get('cours') !== undefined || anime.get('latestCour') !== undefined
  )
  console.log(`作品 ${animes.size}件 / フィールドを持つもの ${targets.length}件`)

  if (!apply) {
    console.log('\nnothing written (pass --apply to write)')
    return
  }

  let batch = db.batch()
  let pending = 0
  for (const anime of targets) {
    batch.update(anime.ref, { cours: FieldValue.delete(), latestCour: FieldValue.delete() })
    if (++pending === 400) {
      await batch.commit()
      batch = db.batch()
      pending = 0
    }
  }
  if (pending) await batch.commit()

  console.log(`${targets.length}件から cours と latestCour を削除しました`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
