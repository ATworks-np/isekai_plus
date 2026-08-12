#!/usr/bin/env node
/**
 * Builds the season -> tag id index for animatetimes.com.
 *
 *   node crawl-season-index.mjs [outputCsv]
 *
 * Season pages carry no year in their URL, and the ids are not sequential in
 * any usable way: the current and upcoming seasons sit on low fixed ids
 * (2026夏 is 5806) while past ones were assigned in the twenty-thousands as
 * they happened. The only reliable route is that each season page links to the
 * others, so this walks that graph from whatever is known until it stops
 * finding new seasons.
 *
 * Writes CSV: cour,year,season,tagId,url,verified,entries
 * `verified` says the page really carried work tables rather than just a name.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const BASE = 'https://www.animatetimes.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) isekai-plus season index'
const SEEDS = ['5806', '5228', '5947', '6212', '28330', '27657', '21894', '12077']
const QUARTER = { 冬: 1, 春: 2, 夏: 3, 秋: 4 }
const OLDEST_YEAR = 2016
const output = process.argv[2] ?? '.claude/skills/season-anime/data/seasons.csv'

const decodeEntities = html =>
  html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))

const get = async id => {
  const response = await fetch(`${BASE}/tag/details.php?id=${id}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
    redirect: 'follow',
    signal: AbortSignal.timeout(40_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

/** Season links anywhere on the page, as {tagId, year, season}. */
const seasonLinksIn = html => {
  const found = new Map()
  const pattern = /<a[^>]*href="[^"]*tag\/details\.php\?id=(\d+)[^"]*"[^>]*>([^<]{3,40})<\/a>/g
  for (const [, id, rawLabel] of html.matchAll(pattern)) {
    const label = decodeEntities(rawLabel).trim()
    const m = /^(20\d\d)\s*(冬|春|夏|秋)アニメ/.exec(label)
    if (!m) continue
    found.set(id, { tagId: id, year: Number(m[1]), season: m[2] })
  }
  return [...found.values()]
}

const main = async () => {
  const seen = new Map()
  const queue = [...SEEDS]
  const visited = new Set()

  while (queue.length) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)

    let html
    try {
      html = await get(id)
    } catch (error) {
      console.error(`  id=${id} 取得失敗: ${error.message}`)
      continue
    }

    const titleMatch = /<title>([^<]*)<\/title>/.exec(html)
    const pageTitle = titleMatch ? decodeEntities(titleMatch[1]) : ''
    const entries = (html.match(/<table[^>]*frame="hsides"/g) ?? []).length

    // The page's own identity comes from its title, not from how another page
    // labelled the link to it.
    const self = /^(?:\d+ページ目：)?(20\d\d)(冬|春|夏|秋)アニメ/.exec(pageTitle)
    if (self) {
      const year = Number(self[1])
      const season = self[2]
      const cour = `${year}-Q${QUARTER[season]}`
      const previous = seen.get(cour)
      if (!previous || entries > previous.entries) {
        seen.set(cour, { cour, year, season, tagId: id, entries })
      }
    }

    for (const link of seasonLinksIn(html)) {
      if (link.year < OLDEST_YEAR) continue
      if (!visited.has(link.tagId)) queue.push(link.tagId)
    }

    process.stdout.write(`\r  訪問 ${visited.size}件 / 未訪問 ${queue.length}件 / 確定 ${seen.size}クール      `)
  }
  console.log('')

  const rows = [...seen.values()].sort((a, b) => a.cour.localeCompare(b.cour))
  const csv = [
    'cour,year,season,tagId,url,verified,entries',
    ...rows.map(row =>
      [
        row.cour,
        row.year,
        row.season,
        row.tagId,
        `${BASE}/tag/details.php?id=${row.tagId}`,
        row.entries > 0 ? 'yes' : 'no',
        row.entries,
      ].join(',')
    ),
  ].join('\n')

  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, csv + '\n', 'utf8')

  console.log(`\n${output} に ${rows.length}クールを書き出しました`)
  const missing = []
  for (let year = OLDEST_YEAR; year <= 2027; year++) {
    for (const [season, q] of Object.entries(QUARTER)) {
      const cour = `${year}-Q${q}`
      if (year === 2027 && q > 1) continue
      if (!seen.has(cour)) missing.push(`${year}${season}`)
    }
  }
  if (missing.length) console.log(`未取得: ${missing.join(' ')}`)
  const unverified = rows.filter(r => r.entries === 0)
  if (unverified.length) console.log(`作品表なし: ${unverified.map(r => r.cour).join(' ')}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
