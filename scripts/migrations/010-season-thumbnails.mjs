#!/usr/bin/env node
/**
 * Stores a key visual for every season that has one at the source.
 *
 *   node scripts/migrations/010-season-thumbnails.mjs           # dry run
 *   node scripts/migrations/010-season-thumbnails.mjs --apply   # writes
 *
 * Thumbnails were per series, so switching tabs left the same image on screen
 * even when each season has its own key visual — which animatetimes carries for
 * all of them. Each season's image is stored beside the series' at
 * thumbnail/<animeId>/<seasonId>, and the series image stays as the fallback so
 * a season without one still renders.
 *
 * Goes through the API rather than writing Storage directly, so the fetch,
 * SSRF check, WebP conversion and hasThumbnail flag all follow the same
 * path a normal season update takes.
 *
 * Requires ISEKAI_API_KEY / ISEKAI_API_BASE in .env.local, plus
 * gcloud auth application-default login for reading the database.
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
if (apply && (!KEY || !BASE)) throw new Error('ISEKAI_API_KEY / ISEKAI_API_BASE missing')

initializeApp({
  credential: applicationDefault(),
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
})
const db = getFirestore()

const loadWorks = () => {
  const byTagId = new Map()
  for (const file of readdirSync(WORKS_DIR)) {
    for (const work of parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8')).works) {
      if (!byTagId.has(work.workTagId)) byTagId.set(work.workTagId, work)
    }
  }
  return byTagId
}

const main = async () => {
  const byTagId = loadWorks()
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'dry-run'} | 作品 ${animes.size}件\n`)

  let done = 0
  let skipped = 0
  let failed = 0

  for (const anime of animes.docs) {
    const seasons = await anime.ref.collection('seasons').orderBy('order').get()
    for (const season of seasons.docs) {
      if (season.get('hasThumbnail')) continue

      const tagId = season.get('metadata.animatetimes.workTagId')
      const work = tagId ? byTagId.get(tagId) : null
      const url = work?.thumbnail?.url
      if (!url) {
        skipped++
        continue
      }

      const label = `${anime.get('name')?.ja ?? ''} / ${season.get('label')}`
      if (!apply) {
        console.log(`  ${label}\n      ${url}`)
        done++
        continue
      }

      try {
        const response = await fetch(
          `${BASE}/api/v1/animes/${anime.id}/seasons/${season.id}/`,
          {
            method: 'PATCH',
            headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: url }),
            signal: AbortSignal.timeout(180_000),
          }
        )
        if (response.ok) {
          done++
          console.log(`OK   ${label}`)
        } else {
          failed++
          const body = await response.json().catch(() => ({}))
          console.log(`FAIL ${response.status} ${label}: ${JSON.stringify(body)}`)
        }
      } catch (error) {
        failed++
        console.log(`FAIL --  ${label}: ${error.message}`)
      }
    }
  }

  console.log(`\n対象 ${done}件 / 元データに画像なし ${skipped}件 / 失敗 ${failed}件`)
  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
