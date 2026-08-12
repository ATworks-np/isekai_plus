#!/usr/bin/env node
/**
 * Scrapes anime.eiga.com season listings for the season-anime skill.
 *
 *   node fetch-season.mjs list 2026-summer     -> [{ programId, title, url }]
 *   node fetch-season.mjs image 113254 112723  -> [{ programId, imageUrl }]
 *
 * `list` costs one request. Detail pages are fetched separately, and only for
 * the works that survive filtering, so a season sweep is ~15 requests, not 117.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) isekai-plus season importer'
const BASE = 'https://anime.eiga.com'

const decodeEntities = html =>
  html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))

const get = async url => {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${response.status}`)
  return response.text()
}

const listSeason = async slug => {
  if (!/^\d{4}-(spring|summer|autumn|winter)$/.test(slug)) {
    throw new Error(`Bad season slug "${slug}". Expected e.g. 2026-summer (autumn, not fall).`)
  }

  // The current season redirects to /program/; following it lands on the same markup.
  const html = await get(`${BASE}/program/season/${slug}/`)
  const pattern = /<p class="seasonAnimeTtl">\s*<a href="\/program\/(\d+)\/">([\s\S]*?)<\/a>/g

  const seen = new Set()
  const items = []
  for (const [, programId, rawTitle] of html.matchAll(pattern)) {
    if (seen.has(programId)) continue
    seen.add(programId)
    const title = decodeEntities(rawTitle.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
    if (title) items.push({ programId, title, url: `${BASE}/program/${programId}/` })
  }

  if (items.length === 0) throw new Error(`No titles parsed from ${slug}; the page markup may have changed.`)
  return items
}

const fetchImage = async programId => {
  const html = await get(`${BASE}/program/${programId}/`)
  // og:image is the unsized original; the /160 and /320 variants are thumbnails.
  const match = html.match(/<meta property="og:image" content="([^"]+)"/)
  return { programId, imageUrl: match ? match[1] : null }
}

const mapWithLimit = async (items, limit, fn) => {
  const results = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

const main = async () => {
  const [command, ...args] = process.argv.slice(2)

  if (command === 'list') {
    if (!args[0]) throw new Error('Usage: fetch-season.mjs list <YYYY-season>')
    console.log(JSON.stringify(await listSeason(args[0]), null, 2))
    return
  }

  if (command === 'image') {
    if (args.length === 0) throw new Error('Usage: fetch-season.mjs image <programId...>')
    // Keep concurrency low; this is someone else's server.
    console.log(JSON.stringify(await mapWithLimit(args, 4, fetchImage), null, 2))
    return
  }

  throw new Error('Usage: fetch-season.mjs list <YYYY-season> | image <programId...>')
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
