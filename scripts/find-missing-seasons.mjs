#!/usr/bin/env node
/**
 * Cross-references the database against anime.eiga.com to find broadcasts of
 * registered works that were never added. Read only.
 *
 *   node scripts/find-missing-seasons.mjs [fromYear] [toYear]
 *
 * Comparing records against each other cannot find these. とんでもスキルで異世界
 * 放浪メシ is in the database only as its second season; there is no first
 * season record to notice is related to anything. The gap is only visible from
 * outside, so this walks every season listing and matches titles back.
 *
 * A two cour broadcast is listed under both quarters it ran in. That is one
 * season, not two, so entries are grouped by program id and adjacent quarters
 * are collapsed into a single run. Specials are dropped — only the main
 * broadcast counts as a season.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const BASE = 'https://anime.eiga.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) isekai-plus season audit'
const SLUGS = ['winter', 'spring', 'summer', 'autumn']
const MIN_PREFIX = 6

/** Not a season of the series: specials, recaps, reruns. */
const NOT_A_SEASON = /(TVSP|ＴＶＳＰ|総集編|特別編|特番|ダイジェスト|再放送|SPECIAL|スペシャル)/i

const fromYear = Number(process.argv[2] ?? 2016)
const toYear = Number(process.argv[3] ?? 2026)

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

const decodeEntities = html =>
  html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))

const normalize = title =>
  title
    .normalize('NFKC')
    .replace(/[〜～~]/g, '~')
    .replace(/[“”„‟"]/g, '"')
    .replace(/[‘’‚‛']/g, "'")
    .replace(/\s+/g, '')
    .toLowerCase()

const courIndex = cour => {
  const m = /^(\d{4})-Q([1-4])$/.exec(cour)
  return m ? Number(m[1]) * 4 + (Number(m[2]) - 1) : null
}
const courLabel = index => `${Math.floor(index / 4)}-Q${(index % 4) + 1}`

const fetchQuarter = async (year, slugIndex) => {
  const slug = `${year}-${SLUGS[slugIndex]}`
  const cour = `${year}-Q${slugIndex + 1}`
  const response = await fetch(`${BASE}/program/season/${slug}/`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) return { cour, items: [] }

  const html = await response.text()
  const pattern = /<p class="seasonAnimeTtl">\s*<a href="\/program\/(\d+)\/">([\s\S]*?)<\/a>/g
  const seen = new Set()
  const items = []
  for (const [, programId, raw] of html.matchAll(pattern)) {
    if (seen.has(programId)) continue
    seen.add(programId)
    const title = decodeEntities(raw.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
    if (title) items.push({ programId, title })
  }
  return { cour, items }
}

const related = (a, b) => {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.length >= MIN_PREFIX && longer.startsWith(shorter)
}

const main = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  const records = animes.docs.map(anime => ({
    id: anime.id,
    name: anime.get('name')?.ja ?? '',
    key: normalize(anime.get('name')?.ja ?? ''),
    cours: (anime.get('cours') ?? []).filter(Boolean),
  }))
  console.log(`DB: ${records.length}件 / 走査: ${fromYear}〜${toYear}\n`)

  const programs = new Map()
  for (let year = fromYear; year <= toYear; year++) {
    for (let q = 0; q < 4; q++) {
      const listing = await fetchQuarter(year, q)
      process.stdout.write(`\r  取得中 ${listing.cour} (${listing.items.length}件)      `)
      for (const item of listing.items) {
        const entry = programs.get(item.programId) ?? { title: item.title, quarters: [] }
        entry.quarters.push(courIndex(listing.cour))
        // Later listings carry the more complete title (e.g. with 第2期).
        if (item.title.length > entry.title.length) entry.title = item.title
        programs.set(item.programId, entry)
      }
    }
  }
  console.log('\n')

  // Adjacent quarters for one program id are one continuous broadcast.
  const broadcasts = []
  for (const [programId, entry] of programs) {
    if (NOT_A_SEASON.test(entry.title)) continue
    const indices = [...new Set(entry.quarters)].sort((a, b) => a - b)
    const runs = []
    for (const index of indices) {
      const last = runs[runs.length - 1]
      if (last && index === last[last.length - 1] + 1) last.push(index)
      else runs.push([index])
    }
    for (const run of runs) {
      broadcasts.push({ programId, title: entry.title, cours: run.map(courLabel) })
    }
  }

  const findings = []
  for (const broadcast of broadcasts) {
    const key = normalize(broadcast.title)
    const matches = records.filter(record => related(key, record.key))
    if (matches.length === 0) continue

    const covered = matches.some(record => broadcast.cours.every(c => record.cours.includes(c)))
    if (covered) continue

    const partial = matches.filter(record => broadcast.cours.some(c => record.cours.includes(c)))
    findings.push({ ...broadcast, matches, partial })
  }

  findings.sort((a, b) => a.cours[0].localeCompare(b.cours[0]))

  console.log('=== DB に反映されていない放送 ===')
  let partialCount = 0
  for (const finding of findings) {
    const span =
      finding.cours.length > 1
        ? `${finding.cours[0]}〜${finding.cours[finding.cours.length - 1]} (${finding.cours.length}クール連続)`
        : finding.cours[0]
    console.log(`\n  ${finding.title}   [program ${finding.programId}]`)
    console.log(`    放送: ${span}`)
    finding.matches.forEach(record =>
      console.log(`    DB  : ${record.id}  ${record.name}  cours=${JSON.stringify(record.cours)}`)
    )
    if (finding.partial.length) {
      partialCount++
      const missing = finding.cours.filter(c => !finding.partial[0].cours.includes(c))
      console.log(`    → 同一期だが cours 不足: ${JSON.stringify(missing)} を追加`)
    } else {
      console.log(`    → 未登録の期`)
    }
  }

  console.log(`\n\n計 ${findings.length}件（うち cours 不足 ${partialCount}件 / 未登録の期 ${findings.length - partialCount}件）`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
