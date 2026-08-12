#!/usr/bin/env node
/**
 * Reads a season listing from animatetimes.com.
 *
 *   node fetch-animatetimes.mjs season <tagId>   -> [{ title, workTagId, series, seriesTagId, format, schedule }]
 *   node fetch-animatetimes.mjs page <tagId>     -> same, but prints the page title too
 *
 * Each entry is a table whose rows are labelled 作品名 / 放送形態 / シリーズ /
 * スケジュール. Both 作品名 and シリーズ link to a tag id, and the series tag is
 * the thing worth having: two works belong to the same series exactly when they
 * share it, with no title normalising to guess at.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) isekai-plus season importer'
const BASE = 'https://www.animatetimes.com'

const decodeEntities = html =>
  html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))

const text = html =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .trim()

const tagIdIn = html => {
  const m = /tag\/details\.php\?id=(\d+)/.exec(html)
  return m ? m[1] : null
}

const get = async url => {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
    redirect: 'follow',
    signal: AbortSignal.timeout(40_000),
  })
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${response.status}`)
  return response.text()
}

/** Rows of one entry table, keyed by their label cell. */
const parseTable = tableHtml => {
  const fields = {}
  const rowPattern = /<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<\/tr>/g
  for (const [, label, value] of tableHtml.matchAll(rowPattern)) {
    fields[text(label)] = { text: text(value), html: value }
  }
  return fields
}

export const parseSeasonPage = html => {
  const entries = []
  const tablePattern = /<table[^>]*frame="hsides"[^>]*>([\s\S]*?)<\/table>/g

  for (const [, tableHtml] of html.matchAll(tablePattern)) {
    const fields = parseTable(tableHtml)
    const title = fields['作品名']
    if (!title) continue

    entries.push({
      title: title.text,
      workTagId: tagIdIn(title.html),
      format: fields['放送形態']?.text ?? null,
      series: fields['シリーズ']?.text ?? null,
      seriesTagId: fields['シリーズ'] ? tagIdIn(fields['シリーズ'].html) : null,
      schedule: fields['スケジュール']?.text ?? null,
    })
  }
  return entries
}

const main = async () => {
  const [command, tagId] = process.argv.slice(2)
  if (!tagId || !/^\d+$/.test(tagId)) {
    throw new Error('Usage: fetch-animatetimes.mjs season|page <tagId>')
  }

  const html = await get(`${BASE}/tag/details.php?id=${tagId}`)

  if (command === 'page') {
    const m = /<title>([^<]*)<\/title>/.exec(html)
    console.error(`page: ${m ? decodeEntities(m[1]) : '(no title)'}`)
  } else if (command !== 'season') {
    throw new Error('Usage: fetch-animatetimes.mjs season|page <tagId>')
  }

  console.log(JSON.stringify(parseSeasonPage(html), null, 2))
}

// Comparing import.meta.url to argv[1] needs pathToFileURL to survive a Windows
// drive letter; the script only ever runs as a CLI, so just run.
main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
