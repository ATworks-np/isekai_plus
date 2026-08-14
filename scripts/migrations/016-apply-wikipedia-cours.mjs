#!/usr/bin/env node
/**
 * Applies the cours the Wikipedia recheck confirmed the database was missing.
 *
 *   node scripts/migrations/016-apply-wikipedia-cours.mjs           # dry run
 *   node scripts/migrations/016-apply-wikipedia-cours.mjs --apply   # writes
 *
 * animatetimes lists a programme on the season page it started on, so the
 * second cour of a continuous two cour run never arrived: ダンジョン飯 ran from
 * January to June 2024 and the database had only January. The first grok pass
 * asked for cours and could not be checked; this list comes from the second,
 * which asked for broadcast dates and episode counts, and every entry here has
 * a run too long to fit in the single cour on record.
 *
 * Corrections are listed rather than derived — 冒険者になりたいと都に出て行った娘
 * also starts in one quarter and ends in another, but at 全13話 it is one cour
 * whatever the dates touch.
 *
 * Writes go through the API rather than Firestore so the cours land on the
 * season, the only place that stores them, and the deployed server drops its
 * season index.
 *
 * Requires: ISEKAI_API_KEY and ISEKAI_API_BASE in .env.local
 */

import { readFileSync } from 'fs'

const apply = process.argv.includes('--apply')

/** Cours to add to a season that already exists, keyed by its label. */
const ADDITIONS = [
  { id: 'Iha4dPzQ7d8rnkyJmdQY', name: '陰の実力者になりたくて！', label: '第1期', add: ['2023-Q1'] },
  { id: 'Y3Y8pznhdQoysznKdd1Z', name: '盾の勇者の成り上がり', label: '第1期', add: ['2019-Q2'] },
  { id: '6zeKR83nXMROJh7Fc2lw', name: '贄姫と獣の王', label: '第1期', add: ['2023-Q3'] },
  { id: 'tYuXGhOjEbrv38nADnR5', name: 'ダンジョン飯', label: '第1期', add: ['2024-Q2'] },
  { id: 'Y96gwnCKBhpZD5uySTgw', name: 'Helck', label: '第1期', add: ['2023-Q4'] },
  { id: 'nIvj0yH6nuAFCckiOiHb', name: 'ありふれた職業で世界最強', label: '第3期', add: ['2025-Q1'] },
  {
    id: '6pyHy7eXQQaZEvXW7ZMY',
    name: '追放された転生重騎士はゲーム知識で無双する',
    label: '第1期',
    add: ['2026-Q4'],
  },
  { id: 'PWcoysLGIHCqc11mf0Vg', name: '転生したらスライムだった件', label: '第3期', add: ['2024-Q3'] },
  { id: 'PWcoysLGIHCqc11mf0Vg', name: '転生したらスライムだった件', label: '第4期', add: ['2026-Q3'] },
  { id: 'yUgDDHQqPK2e7anRzxTz', name: 'Re:ゼロから始める異世界生活', label: '第1期', add: ['2016-Q3'] },
  { id: 'yUgDDHQqPK2e7anRzxTz', name: 'Re:ゼロから始める異世界生活', label: '第3期', add: ['2025-Q1'] },
]

/** A season the database never had at all. */
const NEW_SEASONS = [
  {
    id: 'xJdK7qzlpwDJ7G9oaI2J',
    name: 'ハズレ枠の【状態異常スキル】で最強になった俺がすべてを蹂躙するまで',
    order: 2,
    label: '第2期',
    // 2026年1月7日〜3月25日 全12話。animatetimes の 2026-Q1 一覧には出ていない
    // ため、サムネイルは後から入れる。
    cours: ['2026-Q1'],
  },
]

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('='))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const BASE = env.ISEKAI_API_BASE ?? 'https://ani-mato.net'
const KEY = env.ISEKAI_API_KEY
if (!KEY) throw new Error('.env.local に ISEKAI_API_KEY がありません')

const request = async (method, path, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const seasonsOf = async id => (await request('GET', `/api/v1/animes/${id}/seasons/`)).seasons

const main = async () => {
  console.log(`mode: ${apply ? 'apply' : 'dry-run'}  base: ${BASE}\n`)

  for (const correction of ADDITIONS) {
    const seasons = await seasonsOf(correction.id)
    const season = seasons.find(entry => entry.label === correction.label)
    if (!season) {
      console.log(`SKIP ${correction.name} / ${correction.label}: 該当する期がありません\n`)
      continue
    }

    const cours = [...new Set([...season.cours, ...correction.add])].sort()
    console.log(`=== ${correction.name} / ${season.label} [${season.id}]`)
    console.log(`  ${JSON.stringify(season.cours)} -> ${JSON.stringify(cours)}`)

    if (!apply) {
      console.log()
      continue
    }
    // cours is replaced rather than merged, so the whole set goes back.
    const updated = await request(
      'PATCH',
      `/api/v1/animes/${correction.id}/seasons/${season.id}/`,
      { cours }
    )
    console.log(`  -> ${JSON.stringify(updated.cours)}\n`)
  }

  for (const season of NEW_SEASONS) {
    const existing = await seasonsOf(season.id)
    console.log(`=== ${season.name} / ${season.label} を新設`)
    console.log(`  既存: ${existing.map(entry => `${entry.label}${JSON.stringify(entry.cours)}`).join(' ')}`)
    if (existing.some(entry => entry.label === season.label || entry.order === season.order)) {
      console.log('  SKIP: 同じ期が既にあります\n')
      continue
    }
    console.log(`  新規: ${season.label} order=${season.order} ${JSON.stringify(season.cours)}`)

    if (!apply) {
      console.log()
      continue
    }
    const created = await request('POST', `/api/v1/animes/${season.id}/seasons/`, {
      order: season.order,
      label: season.label,
      cours: season.cours,
    })
    console.log(`  -> ${created.id} ${created.label} ${JSON.stringify(created.cours)}\n`)
  }

  if (!apply) console.log('nothing written (pass --apply to write)')
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
