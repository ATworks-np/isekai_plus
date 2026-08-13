#!/usr/bin/env node
/**
 * Reports works that are really several seasons, in the two shapes the data
 * takes. Read only — it writes nothing.
 *
 *   node scripts/analyze-series.mjs
 *
 * A) Split: two records that are the same series under different titles. Exact
 *    matching misses these — the titles differ by sequel markers and by which
 *    wave dash the source happened to use — so they are grouped on a normalized
 *    key instead.
 *
 * B) Gapped: one record whose season covers non-adjacent quarters. Two cours
 *    back to back is a single continuous run; a gap means separate broadcasts,
 *    which is separate seasons wearing one season document.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync } from 'fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'

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

/** Sequel markers, longest first so "2nd season" wins over a bare "2". */
const SEQUEL_PATTERNS = [
  /[（(]?第\s*[0-9０-９]+\s*期[）)]?/g,
  /\b[0-9]+(st|nd|rd|th)\s*season\b/gi,
  /\bseason\s*[0-9]+\b/gi,
  /\bpart\s*[0-9]+\b/gi,
  /[ⅡⅢⅣⅤ]/g,
  /(?<=[^A-Za-z])(II|III|IV|V)(?=$|[^A-Za-z])/g,
]

const normalize = title => {
  let text = title.normalize('NFKC')
  // Wave dash, fullwidth tilde and ascii tilde all show up for the same mark.
  text = text.replace(/[〜～~]/g, '~')
  text = text.replace(/[“”„‟"]/g, '"').replace(/[‘’‚‛']/g, "'")
  for (const pattern of SEQUEL_PATTERNS) text = text.replace(pattern, ' ')
  text = text.replace(/[!！?？]/g, ' ')
  text = text.replace(/\s+/g, '')
  return text.toLowerCase()
}

const quarterIndex = cour => {
  const match = /^(\d{4})-Q([1-4])$/.exec(cour)
  return match ? Number(match[1]) * 4 + (Number(match[2]) - 1) : null
}

const runsOf = cours => {
  const indices = [...new Set(cours.map(quarterIndex).filter(i => i !== null))].sort((a, b) => a - b)
  const runs = []
  for (const index of indices) {
    const last = runs[runs.length - 1]
    if (last && index === last[last.length - 1] + 1) last.push(index)
    else runs.push([index])
  }
  return runs
}

const label = index => `${Math.floor(index / 4)}-Q${(index % 4) + 1}`

const main = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  console.log(`animes: ${animes.size}\n`)

  const records = animes.docs.map(anime => ({
    id: anime.id,
    name: anime.get('name')?.ja ?? '',
    key: normalize(anime.get('name')?.ja ?? ''),
    cours: (anime.get('cours') ?? []).filter(Boolean),
  }))

  // Enumerating sequel markers misses whichever one nobody thought of — this
  // data uses 第N期, 第Nクール, II, 2nd season and a bare trailing 2. Prefix
  // containment catches a sequel however it is spelled, as long as it starts
  // with the title it continues.
  const MIN_PREFIX = 6
  const parent = new Map(records.map(r => [r.id, r.id]))
  const find = id => (parent.get(id) === id ? id : (parent.set(id, find(parent.get(id))), parent.get(id)))
  const union = (a, b) => parent.set(find(a), find(b))

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const [a, b] = [records[i], records[j]]
      const [shorter, longer] = a.key.length <= b.key.length ? [a, b] : [b, a]
      if (shorter.key.length < MIN_PREFIX) continue
      if (longer.key.startsWith(shorter.key)) union(a.id, b.id)
    }
  }

  const groups = new Map()
  for (const record of records) {
    const root = find(record.id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(record)
  }

  console.log('=== A) 別レコードに分かれているシリーズ（統合候補） ===')
  let splits = 0
  for (const entries of groups.values()) {
    if (entries.length < 2) continue
    splits++
    entries.sort((a, b) => (a.cours[0] ?? '').localeCompare(b.cours[0] ?? ''))
    console.log('')
    entries.forEach(e => console.log(`    ${e.id}  ${e.name}  cours=${JSON.stringify(e.cours)}`))
  }
  if (splits === 0) console.log('  なし')

  console.log('\n\n=== B) 1レコードに複数の放送期間が入っているもの（期の分割候補） ===')
  const gapped = []
  for (const anime of animes.docs) {
    const seasons = await anime.ref.collection('seasons').get()
    for (const season of seasons.docs) {
      const runs = runsOf(season.get('cours') ?? [])
      if (runs.length > 1) {
        gapped.push({
          id: anime.id,
          name: anime.get('name')?.ja ?? '',
          seasonId: season.id,
          runs,
        })
      }
    }
  }

  gapped.sort((a, b) => b.runs.length - a.runs.length)
  for (const entry of gapped) {
    console.log(`\n  ${entry.id}  ${entry.name}`)
    console.log(`    ${entry.seasonId} が ${entry.runs.length} 期分を保持:`)
    entry.runs.forEach((run, i) => {
      const span = run.length > 1 ? `${label(run[0])}〜${label(run[run.length - 1])}` : label(run[0])
      console.log(`      第${i + 1}期相当: ${span}  (${run.length}クール)`)
    })
  }
  if (gapped.length === 0) console.log('  なし')

  console.log(`\n\n分割レコード: ${splits}組 / 期の分割候補: ${gapped.length}件`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
