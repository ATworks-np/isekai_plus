#!/usr/bin/env node
/**
 * Backfills metadata.animatetimes.workTagId on seasons that lack it.
 *
 *   node scripts/migrations/011-season-work-ids.mjs           # dry run
 *   node scripts/migrations/011-season-work-ids.mjs --apply   # writes
 *
 * Migration 001 gave every work a season before there was any source id to put
 * on it, and 008 only stamped the works it rebuilt. Without the id a season
 * cannot be traced back to its own entry, which is what the key visual comes
 * from.
 *
 * A single-season work inherits the id from the series: they describe the same
 * broadcast. Anything else is matched on cours, and reported rather than
 * guessed when that does not land on exactly one entry.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, readdirSync } from 'fs'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
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

const loadWorks = () => {
  const byTagId = new Map()
  for (const file of readdirSync(WORKS_DIR)) {
    for (const work of parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8')).works) {
      const existing = byTagId.get(work.workTagId)
      if (!existing) byTagId.set(work.workTagId, { ...work })
      else existing.cours = [...new Set([...existing.cours, ...work.cours])].sort()
    }
  }
  return byTagId
}

const siblingsOf = (anchor, byTagId) => {
  const all = [...byTagId.values()]
  const ids = new Set([anchor.workTagId])
  if (anchor.seriesTagId) {
    ids.add(anchor.seriesTagId)
    all.filter(w => w.seriesTagId === anchor.seriesTagId).forEach(w => ids.add(w.workTagId))
  }
  all.filter(w => w.seriesTagId === anchor.workTagId).forEach(w => ids.add(w.workTagId))
  return [...ids].map(id => byTagId.get(id)).filter(Boolean)
}

const main = async () => {
  const byTagId = loadWorks()
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`mode: ${apply ? 'apply' : 'dry-run'} | 作品 ${animes.size}件\n`)

  let filled = 0
  let already = 0
  const unresolved = []

  for (const anime of animes.docs) {
    const animeTagId = anime.get('metadata.animatetimes.workTagId')
    const seasons = await anime.ref.collection('seasons').orderBy('order').get()
    const anchor = animeTagId ? byTagId.get(animeTagId) : null
    const siblings = anchor ? siblingsOf(anchor, byTagId) : []

    for (const season of seasons.docs) {
      if (season.get('metadata.animatetimes.workTagId')) {
        already++
        continue
      }

      let tagId = null
      if (seasons.size === 1 && animeTagId) {
        tagId = animeTagId
      } else {
        const cours = season.get('cours') ?? []
        const matches = siblings.filter(work => work.cours.some(cour => cours.includes(cour)))
        if (matches.length === 1) tagId = matches[0].workTagId
      }

      if (!tagId) {
        unresolved.push(
          `${anime.get('name')?.ja ?? ''} / ${season.get('label')} cours=${JSON.stringify(season.get('cours'))}`
        )
        continue
      }

      filled++
      console.log(
        `  ${anime.get('name')?.ja ?? ''} / ${season.get('label')} -> work=${tagId}`
      )
      if (apply) {
        await season.ref.set(
          { metadata: { animatetimes: { workTagId: tagId } } },
          { merge: true }
        )
      }
    }
  }

  console.log(`\n補完 ${filled}件 / 設定済み ${already}件 / 未解決 ${unresolved.length}件`)
  unresolved.forEach(u => console.log(`  未解決: ${u}`))
  if (!apply) console.log('\nnothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
