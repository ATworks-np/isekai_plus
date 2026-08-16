#!/usr/bin/env node
/**
 * Puts data/taxonomy-v3.yaml onto the tag documents.
 *
 *   node scripts/migrations/023-taxonomy-v3.mjs                # report
 *   node scripts/migrations/023-taxonomy-v3.mjs --apply        # axis/slug/kind/criteria
 *   node scripts/migrations/023-taxonomy-v3.mjs --apply --fold # also merge and retire
 *
 * The first pass only writes fields onto tags that already exist: the axis it
 * belongs to, a slug that will not change when someone edits the display name,
 * whether it names one property or two, and the rewritten criteria. No work
 * changes, no tag disappears, and running it twice does the same thing.
 *
 * --fold is the part that moves works between tags, so it is separate:
 *
 *   merged   five tags fold into another that means the same thing (エーテル
 *            into マナ, 女神 into 神, 日常系 into 日常, 令嬢主人公 into 貴族令嬢,
 *            魔法適性鑑定 into 職業鑑定). Works carrying the old one get the new
 *            one, then the old document goes.
 *   retired  異世界ファンタジー and ファンタジー stop being tags. Between them
 *            they are on 53 works and say only that the work belongs on a site
 *            about isekai. What they were really carrying — whether anyone was
 *            reincarnated at all — is written to the work's scope field instead,
 *            so フリーレン can be fantasy without being an isekai.
 *
 * Everything --fold removes is copied to .backup/ first.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const TAGS_PATH = 'versions/1/tags'
const BACKUP_DIR = '.backup'
const TAXONOMY = 'data/taxonomy-v3.yaml'

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
const fold = process.argv.includes('--fold')

/**
 * The taxonomy file is written by scripts/build-taxonomy-v3.mjs and only ever
 * holds the shapes below, so it is read with a small reader rather than by
 * adding a YAML dependency for one file.
 */
const parseTaxonomy = text => {
  const tags = []
  const merged = []
  const retired = []
  let section = null
  let current = null

  const unquote = v => v.trim().replace(/^"(.*)"$/, '$1')

  for (const line of text.split(/\r?\n/)) {
    if (/^tags:/.test(line)) { section = 'tags'; current = null; continue }
    if (/^merged:/.test(line)) { section = 'merged'; current = null; continue }
    if (/^retired:/.test(line)) { section = 'retired'; current = null; continue }
    if (/^(scope|axes|compound_expansion|new_tags):/.test(line)) { section = null; current = null; continue }
    if (!section || /^\s*#/.test(line) || !line.trim()) continue

    const start = line.match(/^ {2}- (\w+): (.+)$/)
    if (start) {
      current = { [start[1]]: unquote(start[2]) }
      ;({ tags, merged, retired })[section].push(current)
      continue
    }
    const field = line.match(/^ {4}(\w+): (.+)$/)
    if (field && current) current[field[1]] = unquote(field[2])
  }
  return { tags, merged, retired }
}

const main = async () => {
  const { tags, merged, retired } = parseTaxonomy(readFileSync(TAXONOMY, 'utf8'))
  const [tagsSnap, worksSnap] = await Promise.all([
    db.collection(TAGS_PATH).get(),
    db.collection(ANIMES_PATH).get(),
  ])
  const byName = Object.fromEntries(tagsSnap.docs.map(doc => [doc.get('name')?.ja, doc]))
  const usage = name => {
    const doc = byName[name]
    return doc ? worksSnap.docs.filter(w => (w.get('tags') ?? []).some(r => r.id === doc.id)) : []
  }

  console.log(`辞書 ${tagsSnap.size}件 / 作品 ${worksSnap.size}件`)
  console.log(`taxonomy: タグ ${tags.length} / 統合 ${merged.length} / 廃止 ${retired.length}\n`)

  const missing = tags.filter(t => !byName[t.name])
  if (missing.length) console.log(`DBに無い: ${missing.map(t => t.name).join(', ')}\n`)

  // ── fields ────────────────────────────────────────────────────────────
  const writable = tags.filter(t => byName[t.name])
  console.log(`【フィールド】${writable.length}件に axis/slug/kind/criteria を書く`)
  if (apply) {
    let batch = db.batch()
    let n = 0
    for (const tag of writable) {
      batch.set(
        byName[tag.name].ref,
        { axis: tag.axis, slug: tag.slug, kind: tag.kind, criteria: tag.criteria, taxonomyVersion: 3 },
        { merge: true }
      )
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
    }
    await batch.commit()
    console.log(`  書いた: ${writable.length}件`)
  }

  // ── merge and retire ──────────────────────────────────────────────────
  console.log(`\n【統合】${merged.length}件`)
  for (const m of merged) {
    const from = byName[m.from]
    const into = byName[m.into]
    console.log(`  ${m.from} → ${m.into}  (${usage(m.from).length}作品)${from ? '' : '  ※DBに無い'}${into ? '' : '  ※統合先が無い'}`)
  }

  console.log(`\n【廃止】${retired.length}件`)
  for (const r of retired) console.log(`  ${r.name}  (${usage(r.name).length}作品)`)

  if (!fold) {
    console.log('\n統合・廃止は --fold を付けたときだけ実行する')
    return
  }
  if (!apply) return

  mkdirSync(BACKUP_DIR, { recursive: true })
  const file = `${BACKUP_DIR}/023-${process.env.BACKUP_STAMP ?? 'taxonomy'}.json`
  if (existsSync(file)) throw new Error(`${file} が既にあります。BACKUP_STAMP で別名を`)

  const backup = {}
  for (const name of [...merged.map(m => m.from), ...retired.map(r => r.name)]) {
    const doc = byName[name]
    if (!doc) continue
    backup[doc.ref.path] = doc.data()
    backup[`${doc.ref.path}#works`] = usage(name).map(w => ({ id: w.id, name: w.get('name')?.ja }))
  }
  writeFileSync(file, JSON.stringify(backup, null, 2))
  console.log(`\n控え → ${file}`)

  for (const m of merged) {
    const from = byName[m.from]
    const into = byName[m.into]
    if (!from || !into) continue
    for (const work of usage(m.from)) {
      await work.ref.update({ tags: FieldValue.arrayRemove(from.ref) })
      await work.ref.update({ tags: FieldValue.arrayUnion(into.ref) })
    }
    await from.ref.delete()
    console.log(`  統合: ${m.from} → ${m.into}`)
  }

  for (const r of retired) {
    const doc = byName[r.name]
    if (!doc) continue
    for (const work of usage(r.name)) {
      await work.ref.update({ tags: FieldValue.arrayRemove(doc.ref) })
    }
    await doc.ref.delete()
    console.log(`  廃止: ${r.name}`)
  }

  console.log('\n完了。scope フィールドは別途、作品ごとに判定して書く。')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
