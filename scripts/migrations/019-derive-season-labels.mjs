#!/usr/bin/env node
/**
 * Removes the season labels that are a number.
 *
 *   node scripts/migrations/019-derive-season-labels.mjs           # dry run
 *   node scripts/migrations/019-derive-season-labels.mjs --apply   # writes
 *
 * 第1期 is a season's position, not its name, and the API works it out on read.
 * Storing it meant 211 strings that had to be written correctly, kept correct
 * when a season was inserted before them, and translated one by one the moment
 * the site gained a second language.
 *
 * A spinoff keeps its label: 「この素晴らしい世界に爆焔を！」 is a title, and no
 * number describes it.
 *
 * The label is only dropped where the derived value matches what is stored, so
 * a work whose numbering disagrees stays put and gets reported.
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

/** The same rule the API uses: position among the seasons, spinoffs excepted. */
const derive = docs => {
  const ordered = [...docs].sort((a, b) => (a.get('order') ?? 0) - (b.get('order') ?? 0))
  let numbered = 0
  return ordered.map(doc => {
    if ((doc.get('kind') ?? 'season') === 'spinoff') return { doc, label: doc.get('label') ?? '' }
    numbered += 1
    return { doc, label: `第${numbered}期` }
  })
}

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}\n`)

  const animes = await db.collection(ANIMES_PATH).get()
  let removed = 0
  let kept = 0
  const disagreed = []

  for (const anime of animes.docs) {
    const seasons = await anime.ref.collection('seasons').get()
    for (const { doc, label } of derive(seasons.docs)) {
      if ((doc.get('kind') ?? 'season') === 'spinoff') {
        kept++
        continue
      }
      const stored = doc.get('label')
      if (stored === undefined) continue
      if (stored !== label) {
        disagreed.push(`${anime.get('name')?.ja}: 保存 ${stored} / 生成 ${label}`)
        continue
      }
      removed++
      if (apply) await doc.ref.update({ label: FieldValue.delete() })
    }
  }

  console.log(`削除 ${removed}件 / スピンオフとして残す ${kept}件`)
  if (disagreed.length) {
    console.log(`\n生成値と食い違うため残した ${disagreed.length}件:`)
    disagreed.forEach(line => console.log(`  ${line}`))
  }
  if (!apply) console.log('\nnothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
