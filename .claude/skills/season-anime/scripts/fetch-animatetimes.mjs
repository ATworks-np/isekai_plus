#!/usr/bin/env node
/**
 * Scrapes one season listing from animatetimes.com and emits every field the
 * page carries for each work.
 *
 *   node fetch-animatetimes.mjs 2026-Q3            -> YAML on stdout
 *   node fetch-animatetimes.mjs 2026-Q3 --json     -> JSON on stdout
 *   node fetch-animatetimes.mjs --all              -> writes data/works/<cour>.yaml for every season
 *
 * Each work is an <h2> anchor followed by a key visual, a synopsis, and a table
 * whose rows are labelled in Japanese. Both 作品名 and シリーズ link to a tag id,
 * and the series id is the useful one: two works belong to the same series
 * exactly when they share it, with no title normalising to guess at.
 *
 * 公開開始年＆季節 lists the seasons a work aired in, so cours come straight
 * from the page rather than from parsing a broadcast date.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { stringify } from 'yaml'
import { readSeasonIndex } from './season-index.mjs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) isekai-plus season importer'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
const QUARTER = { 冬: 1, 春: 2, 夏: 3, 秋: 4 }

const decodeEntities = html =>
  html
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')

const text = html =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()

const tagIdIn = html => {
  const m = /tag\/details\.php\?id=(\d+)/.exec(html)
  return m ? Number(m[1]) : null
}

/** "2023秋アニメ、2026夏アニメ" -> ["2023-Q4", "2026-Q3"] */
const coursIn = value =>
  [...value.matchAll(/(20\d\d)\s*(冬|春|夏|秋)アニメ/g)].map(
    ([, year, season]) => `${year}-Q${QUARTER[season]}`
  )

const get = async url => {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
    redirect: 'follow',
    signal: AbortSignal.timeout(40_000),
  })
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${response.status}`)
  return response.text()
}

export const parseSeasonPage = html => {
  const works = []

  // Each work runs from its own h2 anchor to the next one.
  const headingPattern = /<h2 class="c-heading-h2" id="(\d+)">\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/g
  const headings = [...html.matchAll(headingPattern)]

  for (const [index, heading] of headings.entries()) {
    const start = heading.index + heading[0].length
    const end = index + 1 < headings.length ? headings[index + 1].index : html.length
    const block = html.slice(start, end)

    const image = /<div class="c-image-a">\s*<img src="([^"]*)"(?:\s+width="(\d+)")?(?:\s+height="(\d+)")?/.exec(block)

    const fields = {}
    const links = {}
    const rowPattern = /<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<\/tr>/g
    for (const [, rawLabel, rawValue] of block.matchAll(rowPattern)) {
      const label = text(rawLabel)
      if (!label) continue
      fields[label] = text(rawValue)
      const id = tagIdIn(rawValue)
      if (id) links[label] = id
    }

    // Synopsis is the loose text between the key visual and the table.
    const tableAt = block.indexOf('<table')
    const imageEnd = image ? block.indexOf('</center>', image.index) : -1
    const synopsis =
      tableAt > 0 && imageEnd > 0 && imageEnd < tableAt
        ? text(block.slice(imageEnd, tableAt))
        : ''

    works.push({
      anchor: Number(heading[1]),
      title: text(heading[3]),
      workTagId: tagIdIn(heading[2]) ?? links['作品名'] ?? null,
      workUrl: decodeEntities(heading[2]),
      seriesTitle: fields['シリーズ'] ?? null,
      seriesTagId: links['シリーズ'] ?? null,
      format: fields['放送形態'] ?? null,
      cours: fields['公開開始年＆季節'] ? coursIn(fields['公開開始年＆季節']) : [],
      episodes: fields['話数'] ?? null,
      schedule: fields['スケジュール'] ?? null,
      thumbnail: image
        ? {
            url: image[1],
            width: image[2] ? Number(image[2]) : null,
            height: image[3] ? Number(image[3]) : null,
          }
        : null,
      synopsis,
      // Everything the table carried, verbatim, so a field this script does not
      // model yet is still recorded rather than dropped on the floor.
      fields,
    })
  }

  return works
}

const fetchCour = async cour => {
  const { seasons } = readSeasonIndex()
  const season = seasons.find(entry => entry.cour === cour)
  if (!season) throw new Error(`seasons.yaml に ${cour} がありません`)
  return { season, works: parseSeasonPage(await get(season.url)) }
}

const documentFor = (season, works) => ({
  cour: season.cour,
  year: season.year,
  season: season.season,
  tagId: season.tagId,
  url: season.url,
  fetchedCount: works.length,
  works,
})

const main = async () => {
  const args = process.argv.slice(2)

  if (args.includes('--all')) {
    const { seasons } = readSeasonIndex()
    mkdirSync(WORKS_DIR, { recursive: true })
    for (const season of seasons) {
      const works = parseSeasonPage(await get(season.url))
      const path = `${WORKS_DIR}/${season.cour}.yaml`
      writeFileSync(path, stringify(documentFor(season, works), { lineWidth: 0 }), 'utf8')
      console.log(`  ${season.cour}  ${String(works.length).padStart(3)}件  -> ${path}`)
    }
    return
  }

  const cour = args.find(a => /^\d{4}-Q[1-4]$/.test(a))
  if (!cour) throw new Error('Usage: fetch-animatetimes.mjs <YYYY-QN> [--json] | --all')

  const { season, works } = await fetchCour(cour)
  const document = documentFor(season, works)
  console.log(
    args.includes('--json')
      ? JSON.stringify(document, null, 2)
      : stringify(document, { lineWidth: 0 })
  )
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
