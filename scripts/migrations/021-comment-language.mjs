#!/usr/bin/env node
/**
 * Records the language each comment was written in.
 *
 *   node scripts/migrations/021-comment-language.mjs           # dry run
 *   node scripts/migrations/021-comment-language.mjs --apply   # writes
 *
 * A comment is someone's own words, so it is never translated. Labelling it is
 * what lets an English page decide what to do with it — show it as it is, hide
 * it, or offer a translation — instead of presenting Japanese to a reader who
 * asked for English with nothing to say why.
 *
 * Everything on file was written on a Japanese-only site, so it is all ja.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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

  const comments = await db.collectionGroup('comments').get()
  const pending = comments.docs.filter(doc => doc.get('lang') === undefined)

  console.log(`コメント ${comments.size}件 / 言語未記録 ${pending.length}件`)
  pending.slice(0, 3).forEach(doc => {
    console.log(`  ${(doc.get('comment') ?? '').slice(0, 24)}  [${doc.get('userDisplayName')}]`)
  })

  if (!apply) {
    console.log('\nnothing written (pass --apply to write)')
    return
  }

  let batch = db.batch()
  let queued = 0
  for (const doc of pending) {
    batch.update(doc.ref, { lang: 'ja' })
    if (++queued === 400) {
      await batch.commit()
      batch = db.batch()
      queued = 0
    }
  }
  if (queued) await batch.commit()

  console.log(`\n${pending.length}件に lang: 'ja' を記録しました`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
