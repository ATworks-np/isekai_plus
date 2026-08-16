#!/usr/bin/env node
/**
 * Removes name.en where it is not a translation.
 *
 *   node scripts/migrations/018-drop-unusable-en.mjs           # dry run
 *   node scripts/migrations/018-drop-unusable-en.mjs --apply   # writes
 *
 * The field exists on every work and tag, and most of what it holds is not
 * English: 72 works have it blank, 27 hold a copy of the Japanese title, one
 * holds "Anitube - A-Rank Party wo Ridatsu Shita Ore wa…" — a listing scraped
 * with the site's name still attached — and one holds a single full width
 * space.
 *
 * While that is true no code can tell a translated title from an untranslated
 * one, so nothing can list what still needs translating and nothing can decide
 * whether to fall back to Japanese. Absent means untranslated from here on.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const apply = process.argv.includes('--apply')

const COLLECTIONS = [
  { path: 'versions/1/animes', label: '作品' },
  { path: 'versions/1/tags', label: 'タグ' },
]

/** Scraped listings arrive with the source site's name in front of the title. */
const SCRAPED = /^Anitube\b/i

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

const reasonFor = (ja, en) => {
  if (en === undefined || en === null) return null
  if (!String(en).trim()) return '空'
  if (SCRAPED.test(String(en))) return 'スクレイプ残骸'
  if (String(en).trim() === String(ja ?? '').trim()) return '日本語のコピー'
  return null
}

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}\n`)

  for (const collection of COLLECTIONS) {
    const docs = await db.collection(collection.path).get()
    const counts = {}
    let batch = db.batch()
    let pending = 0
    let removed = 0

    for (const doc of docs.docs) {
      const name = doc.get('name') ?? {}
      const reason = reasonFor(name.ja, name.en)
      if (!reason) continue

      counts[reason] = (counts[reason] ?? 0) + 1
      removed++
      if (removed <= 3) {
        console.log(`  ${collection.label}: ${name.ja} — ${reason}（${JSON.stringify(name.en)}）`)
      }

      if (!apply) continue
      batch.update(doc.ref, { 'name.en': FieldValue.delete() })
      if (++pending === 400) {
        await batch.commit()
        batch = db.batch()
        pending = 0
      }
    }

    if (apply && pending) await batch.commit()

    const kept = docs.size - removed
    console.log(
      `${collection.label} ${docs.size}件: 削除 ${removed}件（${Object.entries(counts)
        .map(([reason, n]) => `${reason} ${n}`)
        .join(' / ')}） / 英語として残す ${kept}件\n`
    )
  }

  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
