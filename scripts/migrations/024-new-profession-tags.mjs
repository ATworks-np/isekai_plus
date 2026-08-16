#!/usr/bin/env node
/**
 * Adds the profession tags that data/taxonomy-v3.yaml lists under new_tags.
 *
 *   node scripts/migrations/024-new-profession-tags.mjs           # report
 *   node scripts/migrations/024-new-profession-tags.mjs --apply
 *
 * The compound tags need them. 巨乳剣士 is on nineteen works and is kept, but
 * it is also going to be accompanied by 巨乳 and 剣士 so that a reader looking
 * for either finds those nineteen — and 剣士 does not exist yet. Nor do メイド,
 * 神官, or the four other livelihoods the catalogue plainly contains.
 *
 * Nothing is attached to any work here. These are empty entries in the
 * dictionary for the tagging pass to choose from.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const TAGS_PATH = 'versions/1/tags'

const NEW_TAGS = [
  { ja: '剣士', en: 'Swordsman', slug: 'swordsman' },
  { ja: 'メイド', en: 'Maid', slug: 'maid' },
  { ja: '神官', en: 'Cleric', slug: 'cleric' },
  { ja: '冒険者', en: 'Adventurer', slug: 'adventurer' },
  { ja: '商人', en: 'Merchant', slug: 'merchant' },
  { ja: '鍛冶師', en: 'Blacksmith', slug: 'blacksmith' },
  { ja: '騎士', en: 'Knight', slug: 'knight' },
  { ja: '魔法使い', en: 'Mage', slug: 'mage' },
]

const criteriaFor = name =>
  `キービジュアルまたは公式のキャラクター紹介に出る人物が、${name}を生業にしている`

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('='))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

initializeApp({ credential: applicationDefault(), projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
const db = getFirestore()

const main = async () => {
  const snapshot = await db.collection(TAGS_PATH).get()
  const existing = new Set(snapshot.docs.map(doc => doc.get('name')?.ja))
  const missing = NEW_TAGS.filter(tag => !existing.has(tag.ja))

  console.log(`辞書 ${snapshot.size}件 / 追加するもの ${missing.length}件`)
  for (const tag of missing) console.log(`  ${tag.ja}  (${tag.slug})`)
  const already = NEW_TAGS.filter(tag => existing.has(tag.ja))
  if (already.length) console.log(`既にある: ${already.map(t => t.ja).join(', ')}`)

  if (!process.argv.includes('--apply')) {
    console.log('\n報告のみ。追加するには --apply')
    return
  }

  for (const tag of missing) {
    await db.collection(TAGS_PATH).add({
      name: { ja: tag.ja, en: tag.en },
      slug: tag.slug,
      axis: 'profession',
      kind: 'atomic',
      criteria: criteriaFor(tag.ja),
      taxonomyVersion: 3,
    })
    console.log(`  追加: ${tag.ja}`)
  }
  console.log(`\n辞書 ${snapshot.size + missing.length}件`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
