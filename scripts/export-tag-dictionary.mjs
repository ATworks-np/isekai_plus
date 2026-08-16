#!/usr/bin/env node
/**
 * Writes data/tags.yaml from the database.
 *
 *   node scripts/export-tag-dictionary.mjs
 *
 * The criteria live on the tag documents, edited from the admin screen. This
 * writes them out so a change to the vocabulary shows up as a diff — the tagger
 * reads this file, and a run should be able to say which version of the
 * vocabulary produced it.
 *
 * Bump the version by hand when the criteria change in a way that would change
 * past decisions.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { parse, stringify } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const TAGS_PATH = 'versions/1/tags'
const OUT = 'data/tags.yaml'

/** Groups are a property of the vocabulary as a whole, so they stay here. */
const GROUPS = [
  { key: 'isekai', label: '異世界', note: 'このサイトの中心。どの作品も必ず確認する' },
  { key: 'reborn', label: '転生・転移', note: 'このサイトの中心。転生か転移かを取り違えない' },
  { key: 'skill', label: 'スキル・能力', note: 'このサイトの中心。数値や能力の見せ方' },
  { key: 'body', label: '外見（巨乳系ほか）', note: 'このサイトの中心。画像を見て判定する' },
  { key: 'race', label: '種族', note: '' },
  { key: 'role', label: '役割・職業', note: '' },
  { key: 'place', label: '舞台', note: '' },
  { key: 'plot', label: '物語の型', note: '' },
  { key: 'mood', label: '作風', note: '' },
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

const main = async () => {
  const tagDocs = await db.collection(TAGS_PATH).get()
  const animes = await db.collection(ANIMES_PATH).get()

  const worksByTag = new Map()
  for (const anime of animes.docs) {
    for (const ref of anime.get('tags') ?? []) {
      worksByTag.set(ref.id, [...(worksByTag.get(ref.id) ?? []), anime.get('name')?.ja])
    }
  }

  const entries = tagDocs.docs
    .map(doc => {
      const works = worksByTag.get(doc.id) ?? []
      return {
        name: doc.get('name')?.ja,
        id: doc.id,
        group: doc.get('group') ?? null,
        criteria: doc.get('criteria') ?? '',
        ...(doc.get('aliasOf') ? { aliasOf: doc.get('aliasOf') } : {}),
        ...(doc.get('narrower')?.length ? { narrower: doc.get('narrower') } : {}),
        ...(doc.get('excludedBy')?.length ? { excludedBy: doc.get('excludedBy') } : {}),
        used: works.length,
        examples: works.slice(0, 4),
      }
    })
    .filter(entry => entry.name)

  entries.sort((a, b) => {
    const order = GROUPS.findIndex(g => g.key === a.group) - GROUPS.findIndex(g => g.key === b.group)
    return order !== 0 ? order : b.used - a.used
  })

  // Kept across exports: it marks when the meanings changed, which is a
  // judgement, not something a dump can work out.
  const version = existsSync(OUT) ? (parse(readFileSync(OUT, 'utf8')).version ?? 1) : 1

  mkdirSync('data', { recursive: true })
  writeFileSync(OUT, stringify({ version, groups: GROUPS, tags: entries }))

  const undefined_ = entries.filter(entry => !entry.criteria)
  console.log(`${OUT} に ${entries.length}件（v${version}）`)
  for (const group of GROUPS) {
    console.log(`  ${group.label}: ${entries.filter(e => e.group === group.key).length}件`)
  }
  if (undefined_.length) {
    console.log(`\n判定基準が空のタグ ${undefined_.length}件: ${undefined_.map(e => e.name).join('、')}`)
    console.log('管理画面のタグ一覧から入れてください')
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
