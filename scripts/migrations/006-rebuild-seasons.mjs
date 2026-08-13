#!/usr/bin/env node
/**
 * Rebuilds each work's seasons from anime.eiga.com's programme entries.
 *
 *   node scripts/migrations/006-rebuild-seasons.mjs           # dry run
 *   node scripts/migrations/006-rebuild-seasons.mjs --apply   # writes
 *   node scripts/migrations/006-rebuild-seasons.mjs --refresh # re-fetch the sweep cache
 *
 * Earlier passes inferred seasons from gaps between cours. That is wrong in
 * both directions, and 転生したらスライムだった件 shows each failure:
 *
 *   2021-Q1  第2期 第1部
 *   2021-Q2  転スラ日記        <- a different programme entirely
 *   2021-Q3  第2期 第2部
 *
 * Adjacency would call Q1 and Q3 two separate seasons when they are one, and
 * would swallow 転スラ日記 into them once it is registered. The programme id is
 * the real boundary, and the 第N期 in the title is what groups a split cour
 * back together.
 *
 * The sweep is cached; pass --refresh to rebuild it.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const BASE = 'https://anime.eiga.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) isekai-plus season audit'
const SLUGS = ['winter', 'spring', 'summer', 'autumn']
const MIN_PREFIX = 6
const CACHE = '.cache/eiga-sweep.json'
const FROM_YEAR = 2015
const TO_YEAR = 2026

const NOT_A_SEASON =
  /(TVSP|ＴＶＳＰ|総集編|特別編|特番|ダイジェスト|再放送|新編集版|再編集版|SPECIAL|スペシャル)/i

/**
 * Everything a title can carry to say "this is a later part of that series".
 * Order matters: the longer forms have to go before the bare roman numerals,
 * or "2nd season" loses its "2" and leaves "nd season" behind.
 */
const SEQUEL_MARKERS = [
  /[（(]?\s*第\s*[0-9]+\s*(期|クール|シーズン|部|章)\s*[）)]?/g,
  /[（(]\s*(前半|後半)\s*クール\s*[）)]/g,
  /[0-9]+\s*(?:st|nd|rd|th)\s*season/gi,
  /season\s*[0-9]+/gi,
  /\b(?:2nd|3rd|4th|5th)\b/gi,
  /(?:セカンド|サード)\s*シーズン/g,
  /[ⅡⅢⅣⅤ]/g,
  // ll is a typo for II on the source site — 無職転生ll and 無職転生II are the
  // same season, listed a year apart. The guards keep it from eating a real
  // double L inside a word.
  /(?<![A-Za-z])(?:III|II|IV|V|ll|LL)(?![A-Za-z])/g,
]

/**
 * The series a programme belongs to, with the part that says which instalment
 * it is removed. Prefix matching alone cannot see that
 * "…4th season 奪還編" and "…2nd season（前半クール）" are the same series —
 * they diverge at the marker, which sits in the middle of both.
 */
const baseName = title => {
  let text = title.normalize('NFKC')
  for (const marker of SEQUEL_MARKERS) text = text.replace(marker, ' ')
  // A trailing arc name is part of the instalment, not the series.
  text = text.replace(/\s+\S*[編篇]\s*$/u, ' ')
  text = text.replace(/[-‐-―—~〜～\s]*[0-9]+\s*$/u, ' ')
  text = text.replace(/[!！?？]+/g, ' ')
  return text
    .replace(/[〜～~]/g, '~')
    .replace(/[“”„‟"]/g, '"')
    .replace(/[‘’‚‛']/g, "'")
    .replace(/\s+/g, '')
    .toLowerCase()
}

/**
 * Side stories that share a title with the main series but are not seasons of
 * it. Nothing in the title distinguishes these from a sequel that happens to be
 * subtitled rather than numbered — マッシュル's 神覚者候補選抜試験編 really is its
 * second season — so they are listed rather than detected.
 */
const SPINOFF_PROGRAM_IDS = new Set([
  '108594', // 転生したらスライムだった件 転スラ日記
  '111128', // 転生したらスライムだった件 コリウスの夢
])

const apply = process.argv.includes('--apply')
const refresh = process.argv.includes('--refresh')

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

const ROMAN = { II: 2, III: 3, IV: 4, V: 5, ll: 2, LL: 2, Ⅱ: 2, Ⅲ: 3, Ⅳ: 4, Ⅴ: 5 }

/**
 * Which instalment of the series a title claims to be, or null.
 *
 * 第Nクール is deliberately not read here. A cour is a slice of one season —
 * 無職転生's 第2クール is the back half of season 1, not season 2 — so it
 * groups with whatever numeral the title carries, or with season 1 when it
 * carries none.
 */
const seasonNumberOf = title => {
  const text = title.normalize('NFKC')
  let m
  if ((m = /第\s*(\d+)\s*期/.exec(text))) return Number(m[1])
  if ((m = /(\d+)(?:st|nd|rd|th)\s*season/i.exec(text))) return Number(m[1])
  if ((m = /season\s*(\d+)/i.exec(text))) return Number(m[1])
  if ((m = /(?<![A-Za-z])(III|II|IV|V|ll|LL)(?![A-Za-z])/.exec(text))) return ROMAN[m[1]]
  if ((m = /[ⅡⅢⅣⅤ]/.exec(text))) return ROMAN[m[0]]
  if ((m = /(\d+)\s*$/.exec(text.trim()))) return Number(m[1])
  return null
}

/**
 * A slice of a season rather than a season: a numbered cour, a half, a part.
 * A trailing arc name counts only alongside a numeral — Re:ゼロ's 襲撃編 is half
 * of 3rd season, but マッシュル's 神覚者候補選抜試験編 is a whole season with no
 * number on it at all.
 */
const isPartOfSeason = (title, number) => {
  const text = title.normalize('NFKC')
  if (/第\s*\d+\s*(クール|部)/.test(text)) return true
  if (/[（(]\s*(前半|後半)\s*クール\s*[）)]/.test(text)) return true
  if (number !== null && /\S*[編篇]\s*$/u.test(text)) return true
  return false
}

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

const loadSweep = async () => {
  if (!refresh && existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, 'utf8'))

  const programs = {}
  for (let year = FROM_YEAR; year <= TO_YEAR; year++) {
    for (let q = 0; q < 4; q++) {
      const listing = await fetchQuarter(year, q)
      process.stdout.write(`\r  取得中 ${listing.cour} (${listing.items.length}件)      `)
      for (const item of listing.items) {
        const entry = (programs[item.programId] ??= { title: item.title, cours: [] })
        entry.cours.push(listing.cour)
        if (item.title.length > entry.title.length) entry.title = item.title
      }
    }
  }
  console.log('')
  mkdirSync(dirname(CACHE), { recursive: true })
  writeFileSync(CACHE, JSON.stringify(programs, null, 2))
  return programs
}

/** Same series once both sides are reduced to their base name. */
const related = (a, b) => {
  if (a.length < MIN_PREFIX || b.length < MIN_PREFIX) return false
  return a === b
}

const main = async () => {
  const programs = await loadSweep()
  console.log(`programmes: ${Object.keys(programs).length}\n`)

  const animes = await db.collection(ANIMES_PATH).get()
  let totalDropped = 0

  for (const anime of animes.docs) {
    const name = anime.get('name')?.ja ?? ''
    const key = baseName(name)

    const related_ = Object.entries(programs)
      .filter(([programId, p]) =>
        !SPINOFF_PROGRAM_IDS.has(programId) &&
        !NOT_A_SEASON.test(p.title) &&
        related(baseName(p.title), key)
      )
      .map(([programId, p]) => ({
        programId,
        title: p.title,
        cours: [...new Set(p.cours)].sort(),
        number: seasonNumberOf(p.title),
      }))
      .sort((a, b) => (a.cours[0] ?? '').localeCompare(b.cours[0] ?? ''))

    if (related_.length === 0) continue

    // A numeral groups every programme carrying it into one season. A cour or
    // part with no numeral belongs to season 1 — it is the back half of the
    // original run, not a sequel. Anything else with no numeral is a new season
    // that happens to be subtitled instead of numbered.
    const groups = new Map()
    const extras = []
    for (const program of related_) {
      const part = isPartOfSeason(program.title, program.number)
      const number = program.number ?? (part ? 1 : null)
      if (number === null) {
        const first = related_.find(p => p.number === null && !isPartOfSeason(p.title, p.number))
        if (first === program) {
          const group = groups.get(1) ?? { number: 1, programs: [] }
          group.programs.push(program)
          groups.set(1, group)
        } else extras.push(program)
        continue
      }
      const group = groups.get(number) ?? { number, programs: [] }
      group.programs.push(program)
      groups.set(number, group)
    }

    const seasons = [
      ...[...groups.values()].map(group => ({
        cours: [...new Set(group.programs.flatMap(p => p.cours))].sort(),
        programIds: group.programs.map(p => p.programId),
        titles: group.programs.map(p => p.title),
      })),
      ...extras.map(program => ({
        cours: program.cours,
        programIds: [program.programId],
        titles: [program.title],
      })),
    ].sort((a, b) => (a.cours[0] ?? '').localeCompare(b.cours[0] ?? ''))

    // Numbered by broadcast order rather than by whatever the title claims:
    // sequels are subtitled as often as they are numbered, and the order is the
    // one fact every entry carries.
    seasons.forEach((season, i) => {
      season.order = i + 1
      season.label = `第${i + 1}期`
    })

    const dbCours = (anime.get('cours') ?? []).filter(Boolean).sort()
    const siteCours = [...new Set(seasons.flatMap(s => s.cours))].sort()

    // The site is authoritative, so cours it does not list are dropped. That is
    // not free: older listings only carry a show under the quarter it premiered,
    // so a two cour run from that era loses its second quarter. Every drop is
    // reported so the cost stays visible.
    const dropped = dbCours.filter(cour => !siteCours.includes(cour))
    const existing = await anime.ref.collection('seasons').get()

    const changed =
      existing.size !== seasons.length ||
      JSON.stringify(dbCours) !== JSON.stringify(siteCours)
    if (!changed) continue

    totalDropped += dropped.length
    console.log(`=== ${anime.id}  ${name}`)
    console.log(`  cours: ${JSON.stringify(dbCours)} -> ${JSON.stringify(siteCours)}`)
    if (dropped.length) console.log(`  ** 削除されるクール: ${JSON.stringify(dropped)}`)
    console.log(`  期: ${existing.size} -> ${seasons.length}`)
    seasons.forEach(season => {
      console.log(`    ${season.label}  ${JSON.stringify(season.cours)}   "${season.titles[0]}"`)
    })
    console.log()
  }

  console.log(`削除されるクール合計: ${totalDropped}`)
  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
