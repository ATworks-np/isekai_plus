#!/usr/bin/env node
/**
 * Repairs works created before POST /api/v1/animes started creating a season.
 *
 *   node scripts/migrations/012-repair-seasonless.mjs           # dry run
 *   node scripts/migrations/012-repair-seasonless.mjs --apply   # writes
 *
 * The 2026 spring and summer imports landed between the fix being committed
 * and the rollout reaching production, so those records have neither a season
 * nor metadata. A work with no season cannot be rated at all — the modal has no
 * season id to write to and the page has no tab to draw.
 *
 * Matched back to the source on title, since metadata is exactly what is
 * missing. The name written at import time was the source's own, so an exact
 * match is expected; anything that does not land on one entry is reported.
 *
 * Requires ISEKAI_API_KEY / ISEKAI_API_BASE in .env.local and
 * gcloud auth application-default login.
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
const KEY = local.ISEKAI_API_KEY
const BASE = local.ISEKAI_API_BASE

initializeApp({
  credential: applicationDefault(),
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
})
const db = getFirestore()

const normalize = title =>
  title
    .normalize('NFKC')
    .replace(/[〜～~]/g, '~')
    .replace(/[“”„‟"]/g, '"')
    .replace(/[‘’‚‛']/g, "'")
    .replace(/\s+/g, '')
    .toLowerCase()

const loadWorks = () => {
  const byTitle = new Map()
  const bySeries = new Map()
  for (const file of readdirSync(WORKS_DIR)) {
    for (const work of parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8')).works) {
      const key = normalize(work.title)
      if (!byTitle.has(key)) byTitle.set(key, work)
      if (work.seriesTitle) {
        const seriesKey = normalize(work.seriesTitle)
        if (!bySeries.has(seriesKey)) bySeries.set(seriesKey, work)
      }
    }
  }
  return { byTitle, bySeries }
}

const main = async () => {
  const { byTitle, bySeries } = loadWorks()
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'dry-run'} | 作品 ${animes.size}件\n`)

  let repaired = 0
  const unmatched = []

  for (const anime of animes.docs) {
    const seasons = await anime.ref.collection('seasons').get()
    if (seasons.size > 0) continue

    const name = anime.get('name')?.ja ?? ''
    const key = normalize(name)
    // The record is named after the series when the source gave one, so try
    // that index before the per-work titles.
    const work = bySeries.get(key) ?? byTitle.get(key)

    if (!work) {
      unmatched.push(`${anime.id}  ${name}`)
      continue
    }

    const cours = (anime.get('cours') ?? []).filter(Boolean)
    console.log(`  ${name}`)
    console.log(`      work=${work.workTagId} series=${work.seriesTagId ?? '-'} cours=${JSON.stringify(cours)}`)
    console.log(`      thumbnail=${work.thumbnail?.url ?? '(なし)'}`)
    repaired++

    if (!apply) continue

    await anime.ref.set(
      {
        metadata: {
          animatetimes: { workTagId: work.workTagId, seriesTagId: work.seriesTagId ?? null },
        },
      },
      { merge: true }
    )

    const response = await fetch(`${BASE}/api/v1/animes/${anime.id}/seasons/`, {
      method: 'POST',
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: 1,
        label: '第1期',
        cours,
        imageUrl: work.thumbnail?.url,
      }),
      signal: AbortSignal.timeout(180_000),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      console.log(`      FAIL ${response.status} ${JSON.stringify(body)}`)
      continue
    }

    const season = await response.json()
    await anime.ref
      .collection('seasons')
      .doc(season.id)
      .set({ metadata: { animatetimes: { workTagId: work.workTagId } } }, { merge: true })
  }

  console.log(`\n修復 ${repaired}件 / 照合できず ${unmatched.length}件`)
  unmatched.forEach(u => console.log(`  ${u}`))
  if (!apply) console.log('\nnothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
