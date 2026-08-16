#!/usr/bin/env node
/**
 * Moves the tag dictionary onto the tag documents.
 *
 *   node scripts/migrations/017-tag-dictionary-to-db.mjs           # dry run
 *   node scripts/migrations/017-tag-dictionary-to-db.mjs --apply   # writes
 *
 * A tag's name lived in Firestore while what it means lived in a JavaScript
 * file, which is the same split that let a work's cours disagree with its
 * seasons': adding a tag meant creating a document and then remembering to
 * write its criteria somewhere else, and correcting one did not correct the
 * other.
 *
 * The criteria go on the tag now. data/tags.yaml keeps being written, but as an
 * export of what the database holds — something to read a diff of, not the
 * source it is read from.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const TAGS_PATH = 'versions/1/tags'
const DICTIONARY = 'data/tags.yaml'
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

  const dictionary = parse(readFileSync(DICTIONARY, 'utf8'))
  const byId = new Map(dictionary.tags.map(tag => [tag.id, tag]))

  const tags = await db.collection(TAGS_PATH).get()
  let written = 0
  const missing = []

  for (const doc of tags.docs) {
    const entry = byId.get(doc.id)
    if (!entry) {
      missing.push(doc.get('name')?.ja ?? doc.id)
      continue
    }

    const write = {
      group: entry.group,
      criteria: entry.criteria,
      narrower: entry.narrower ?? [],
      excludedBy: entry.excludedBy ?? [],
      // An alias is a tag that should not be offered on its own; recording it
      // here is what lets the picker stop showing 日常系 next to 日常.
      aliasOf: entry.aliasOf ?? null,
    }

    const unchanged =
      doc.get('group') === write.group &&
      doc.get('criteria') === write.criteria &&
      JSON.stringify(doc.get('narrower') ?? []) === JSON.stringify(write.narrower) &&
      JSON.stringify(doc.get('excludedBy') ?? []) === JSON.stringify(write.excludedBy) &&
      (doc.get('aliasOf') ?? null) === write.aliasOf
    if (unchanged) continue

    console.log(`${entry.name}  ${write.group}  ${write.criteria}`)
    if (write.narrower.length) console.log(`    より具体的: ${write.narrower.join('、')}`)
    if (write.aliasOf) console.log(`    別名: ${write.aliasOf} と同義`)

    written++
    if (apply) await doc.ref.set(write, { merge: true })
  }

  console.log(`\nタグ ${tags.size}件 / 書き込み ${written}件`)
  if (missing.length) {
    console.log(`辞書に無いタグ ${missing.length}件: ${missing.join('、')}`)
    console.log('（先に scripts/build-tag-dictionary.mjs で定義を足してください）')
  }
  if (!apply) console.log('\nnothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
