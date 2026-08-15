#!/usr/bin/env node
/**
 * Fills in staff, cast and theme songs from the animatetimes records.
 *
 *   node scripts/import-credits.mjs              # dry run
 *   node scripts/import-credits.mjs --apply      # writes
 *   node scripts/import-credits.mjs --only <animeId>
 *
 * The crawl already stores every field the site shows, as the free text it was
 * printed in: "監督：中西和也" one line, "シド・カゲノー／シャドウ：山下誠一郎" the
 * next. This turns those lines into records and puts them on the work.
 *
 * Credits are per work here, though the source has them per broadcast — a
 * sequel is a separate record with its own studio and cast. The most recent
 * record wins, since that is what a reader looking at the page now is watching,
 * and the id of the record used is stored alongside so it can be traced.
 *
 * Requires: gcloud auth application-default login, and ISEKAI_API_KEY in
 * .env.local
 */

import { readFileSync, readdirSync } from 'fs'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
const apply = process.argv.includes('--apply')

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

// Overridable so the parser can be checked against a local server before the
// route exists in production.
const BASE = process.env.ISEKAI_API_BASE ?? local.ISEKAI_API_BASE ?? 'https://ani-mato.net'
const KEY = local.ISEKAI_API_KEY
if (apply && !KEY) throw new Error('.env.local に ISEKAI_API_KEY がありません')

initializeApp({
  credential: applicationDefault(),
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
})
const db = getFirestore()

/** Lines read "役職：名前"; the separator is the full width colon. */
const splitEntries = text =>
  String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const at = line.indexOf('：')
      if (at === -1) return { key: '', value: line }
      return { key: line.slice(0, at).trim(), value: line.slice(at + 1).trim() }
    })
    .filter(entry => entry.value)

const STUDIO_ROLES = ['アニメーション制作', 'アニメ制作', '制作スタジオ']

// 制作 means either, depending on the page: "制作：MAPPA" is the studio,
// "制作：モブから始まる製作委員会" is the committee that financed it. The name
// decides, since only one of the two ends in 委員会.
const AMBIGUOUS_STUDIO_ROLES = ['制作']

// The site writes アニメ―ション with a horizontal bar rather than a katakana
// prolonged mark often enough to matter.
const normalizeRole = role => role.replace(/[―‐−–—]/g, 'ー').trim()

const parseStaff = text => {
  const entries = splitEntries(text).filter(entry => entry.key)
  const studios = entries
    .filter(entry => {
      const role = normalizeRole(entry.key)
      if (STUDIO_ROLES.includes(role)) return true
      return AMBIGUOUS_STUDIO_ROLES.includes(role) && !entry.value.includes('委員会')
    })
    // "動画工房　スタジオ雲雀" — two studios, one line.
    .flatMap(entry => entry.value.split(/[\s　]*[／\/、,][\s　]*|[\s　]{2,}/))
    .map(name => name.trim())
    .filter(Boolean)

  return {
    studios: [...new Set(studios)],
    staff: entries.map(entry => ({ role: entry.key, name: entry.value })),
  }
}

const parseCast = text =>
  splitEntries(text).map(entry => ({ character: entry.key, name: entry.value }))

/** "OP：「HIGHEST」OxT" — the title is in corner brackets, the artist follows. */
const parseThemeSongs = text =>
  splitEntries(text).map(entry => {
    const match = /^「(.+?)」\s*(.*)$/.exec(entry.value)
    return {
      type: entry.key || '主題歌',
      title: match ? match[1] : entry.value,
      artist: match ? match[2].trim() : '',
    }
  })

const courOf = file => file.replace('.yaml', '')

/** Every animatetimes record, newest cour first, indexed by work tag. */
const recordsByTag = () => {
  const byTag = new Map()
  for (const file of readdirSync(WORKS_DIR).filter(name => name.endsWith('.yaml'))) {
    const doc = parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8'))
    for (const work of doc.works ?? []) {
      if (!work.workTagId) continue
      // A rerun is the same programme listed again under a later quarter; taking
      // it as the newest record would credit the work to the year it was
      // repeated in.
      if (/再放送|総集編|新編集版|特別編|ダイジェスト/.test(work.title)) continue
      // Filed under the series as well as itself, so a work registered by its
      // first season still finds the sequel's credits — the studio and cast a
      // reader arriving today is watching.
      for (const tag of new Set([work.workTagId, work.seriesTagId].filter(Boolean))) {
        const list = byTag.get(tag) ?? []
        list.push({ cour: courOf(file), ...work })
        byTag.set(tag, list)
      }
    }
  }
  for (const list of byTag.values()) list.sort((a, b) => (a.cour < b.cour ? 1 : -1))
  return byTag
}

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}  base: ${BASE}\n`)

  const byTag = recordsByTag()
  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]

  const animes = await db.collection(ANIMES_PATH).get()
  const targets = animes.docs.filter(doc => (only ? doc.id === only : true))

  let written = 0
  let missing = 0
  const empty = []

  for (const anime of targets) {
    const tag = anime.get('metadata')?.animatetimes?.workTagId
    const records = tag ? byTag.get(tag) : null
    if (!records?.length) {
      missing++
      if (only) console.log(`${anime.get('name')?.ja}: animatetimes のレコードがありません`)
      continue
    }

    // The newest record that actually carries credits: a just-announced sequel
    // is often listed with nothing but a title.
    const record =
      records.find(entry => entry.fields?.スタッフ || entry.fields?.キャスト) ?? records[0]
    const { studios, staff } = parseStaff(record.fields?.スタッフ)
    const cast = parseCast(record.fields?.キャスト)
    let themeSongs = parseThemeSongs(record.fields?.主題歌)

    // A season announced but not yet aired has no theme song listed, and
    // showing none reads as though the work has none. Fall back to the newest
    // season that does rather than leaving the panel off.
    if (!themeSongs.length) {
      const older = records.find(entry => entry !== record && entry.fields?.主題歌)
      if (older) themeSongs = parseThemeSongs(older.fields.主題歌)
    }

    if (!staff.length && !cast.length && !themeSongs.length) {
      empty.push(anime.get('name')?.ja)
      continue
    }

    const credits = {
      studios,
      staff,
      cast,
      themeSongs,
      source: `animatetimes:${record.cour}`,
      sourceWorkTagId: record.workTagId,
    }

    console.log(
      `${anime.get('name')?.ja} [${record.cour}] 制作 ${studios.join('、') || '-'} / スタッフ ${staff.length} / キャスト ${cast.length} / 主題歌 ${themeSongs.length}`
    )

    if (!apply) continue

    const response = await fetch(`${BASE}/api/v1/animes/${anime.id}/credits/`, {
      method: 'PUT',
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(credits),
    })
    if (!response.ok) {
      console.log(`  FAILED ${response.status} ${await response.text()}`)
      continue
    }
    written++
  }

  console.log(`\n対象 ${targets.length}件 / 書き込み ${written}件`)
  console.log(`animatetimes 未紐付け ${missing}件 / 情報なし ${empty.length}件`)
  if (empty.length) console.log(`  ${empty.slice(0, 10).join('、')}${empty.length > 10 ? ' …' : ''}`)
  if (!apply) console.log('\nnothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
