#!/usr/bin/env node
/**
 * Applies the tag proposals in .cache/grok-tags.
 *
 *   node scripts/apply-tags.mjs                 # dry run
 *   node scripts/apply-tags.mjs --apply         # writes
 *   node scripts/apply-tags.mjs --only <id>
 *   node scripts/apply-tags.mjs --with-new      # also create the proposed tags
 *
 * Only tags whose quoted evidence checked out are applied, which is what
 * suggest-tags recorded in each proposal. Existing tags on a work are kept:
 * the API replaces the array wholesale, so the union goes back.
 *
 * Creating a tag is deliberately a separate flag. The vocabulary is the thing
 * that makes the tags findable, and it is already carrying 日常 alongside
 * 日常系; nothing should add to it by accident.
 *
 * Requires: gcloud auth application-default login, and ISEKAI_API_KEY in
 * .env.local
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const TAGS_PATH = 'versions/1/tags'
const CACHE_DIR = '.cache/grok-tags'

const apply = process.argv.includes('--apply')
const withNew = process.argv.includes('--with-new')
const onlyAt = process.argv.indexOf('--only')
const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]

/** English names for the tags being minted; the existing ones all carry both. */
const ENGLISH = {
  グルメ: 'Gourmet',
  キャンプ: 'Camping',
  隠れスキル: 'Hidden Skill',
  エルフ: 'Elf',
}

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
const local = readEnv('.env.local')
const BASE = process.env.ISEKAI_API_BASE ?? local.ISEKAI_API_BASE ?? 'https://ani-mato.net'
const KEY = local.ISEKAI_API_KEY
if (apply && !KEY) throw new Error('.env.local に ISEKAI_API_KEY がありません')

initializeApp({
  credential: applicationDefault(),
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
})
const db = getFirestore()

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}  base: ${BASE}\n`)

  const tagDocs = await db.collection(TAGS_PATH).get()
  const byName = new Map()
  for (const tag of tagDocs.docs) {
    const name = tag.get('name')?.ja
    if (name) byName.set(name.trim(), tag.id)
  }

  const files = readdirSync(CACHE_DIR).filter(name => name.endsWith('.json'))
  const proposals = files
    .map(file => ({ id: file.replace('.json', ''), ...JSON.parse(readFileSync(`${CACHE_DIR}/${file}`, 'utf8')) }))
    .filter(entry => !entry.error && (only ? entry.id === only : true))

  // Tags proposed for creation, gathered across every work that wanted them.
  const wanted = new Map()
  for (const proposal of proposals) {
    for (const tag of proposal.answer.newTags ?? []) {
      const name = tag.name.trim()
      if (byName.has(name)) continue
      wanted.set(name, [...(wanted.get(name) ?? []), proposal.id])
    }
  }

  if (wanted.size) {
    console.log(`新規タグ ${wanted.size}件${withNew ? '' : '（--with-new を付けると作成）'}`)
    for (const [name, works] of wanted) {
      console.log(`  ${name}  (${ENGLISH[name] ?? '英語名なし'})  ${works.length}作品`)
    }
    console.log()
  }

  if (withNew && apply) {
    for (const [name] of wanted) {
      const english = ENGLISH[name]
      if (!english) {
        console.log(`SKIP ${name}: 英語名が未定義`)
        continue
      }
      const ref = await db.collection(TAGS_PATH).add({ name: { ja: name, en: english } })
      byName.set(name, ref.id)
      console.log(`作成 ${name} -> ${ref.id}`)
    }
    console.log()
  }

  for (const proposal of proposals) {
    const anime = await db.doc(`${ANIMES_PATH}/${proposal.id}`).get()
    if (!anime.exists) {
      console.log(`SKIP ${proposal.title}: レコードなし\n`)
      continue
    }

    const verified = (proposal.answer.tags ?? [])
      .filter(entry => proposal.verification?.[entry.tag] === '検証済み')
      .map(entry => entry.tag.trim())
    // Only the ones actually being minted. A name in newTags that the
    // vocabulary already has is a note, not a proposal — スローライフ arrived
    // that way, explained as "一覧にあるが公式文面にその語が無く推測になるため
    // 未選択", and adding it would be adding the tag the model declined to.
    const proposedNew = withNew
      ? (proposal.answer.newTags ?? []).map(tag => tag.name.trim()).filter(name => wanted.has(name))
      : []

    const names = [...new Set([...verified, ...proposedNew])]
    const ids = names.map(name => byName.get(name)).filter(Boolean)

    const existing = (anime.get('tags') ?? []).map(ref => ref.id)
    const merged = [...new Set([...existing, ...ids])]

    const nameOf = id => [...byName].find(([, value]) => value === id)?.[0] ?? id
    const pending = names.filter(name => !byName.has(name))
    console.log(`=== ${proposal.title}`)
    console.log(`  既存 ${existing.length}件 -> ${merged.length + pending.length}件`)
    console.log(
      `  ${[...merged.map(nameOf), ...pending.map(name => `${name}(作成予定)`)].join('、')}`
    )

    if (!apply) {
      console.log()
      continue
    }

    const response = await fetch(`${BASE}/api/v1/animes/${proposal.id}/`, {
      method: 'PATCH',
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: merged }),
    })
    if (!response.ok) {
      console.log(`  FAILED ${response.status} ${await response.text()}\n`)
      continue
    }
    console.log('  書き込み完了\n')
  }

  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
