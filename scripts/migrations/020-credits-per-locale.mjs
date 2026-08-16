#!/usr/bin/env node
/**
 * Moves details/credits to details/ja.
 *
 *   node scripts/migrations/020-credits-per-locale.mjs           # dry run
 *   node scripts/migrations/020-credits-per-locale.mjs --apply   # writes
 *
 * The staff and cast on file are in Japanese — 監督, 山下誠一郎 — so the document
 * that holds them is the Japanese one. Naming it after its language is what
 * lets an English one exist beside it later without the two being merged into a
 * single document that every reader downloads in full.
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

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}\n`)

  const animes = await db.collection(ANIMES_PATH).get()
  let moved = 0
  let already = 0
  let none = 0

  for (const anime of animes.docs) {
    const from = anime.ref.collection('details').doc('credits')
    const to = anime.ref.collection('details').doc('ja')

    const [source, destination] = await Promise.all([from.get(), to.get()])
    if (!source.exists) {
      if (destination.exists) already++
      else none++
      continue
    }

    if (destination.exists) {
      // Both present would mean the migration ran twice with a write in
      // between; leave it alone rather than choosing for someone.
      console.log(`SKIP ${anime.get('name')?.ja}: credits と ja の両方がある`)
      continue
    }

    moved++
    if (moved <= 3) console.log(`${anime.get('name')?.ja}: credits -> ja`)
    if (!apply) continue

    await to.set(source.data())
    await from.delete()
  }

  console.log(`\n移動 ${moved}件 / 移行済み ${already}件 / 作品情報なし ${none}件`)
  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
