#!/usr/bin/env node
/**
 * Finds works whose broadcast was too long for the cours recorded against them.
 *
 *   node scripts/find-short-cours.mjs           # candidates
 *   node scripts/find-short-cours.mjs --all     # every record checked, with its verdict
 *
 * animatetimes lists a programme on the season page it started on, so the
 * second half of a continuous two cour run never arrived. That defect is
 * visible without asking anyone: a record that says 全24話 cannot fit in the
 * single quarter the database has for it.
 *
 * Only records of fifteen episodes or more are considered. Twelve to fourteen
 * is one cour whatever its dates touch, which is the rule that turned out to
 * account for most of the disagreements the first pass reported.
 *
 * Reads only. Nothing here writes to the database.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, readdirSync } from 'fs'
import { parse } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const WORKS_DIR = '.claude/skills/season-anime/data/works'
const ONE_COUR_MAX_EPISODES = 14
const MIN_WEEKS_IN_COUR = 3
const DAY = 24 * 60 * 60 * 1000

const showAll = process.argv.includes('--all')

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

const episodesOf = text => {
  const match = /全\s*(\d+)\s*話/.exec(String(text ?? ''))
  return match ? Number(match[1]) : null
}

/** Every YYYY年M月D日 in the schedule, in the order printed. */
const datesIn = text =>
  [...String(text ?? '').matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)].map(match =>
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  )

const courOfTime = time => {
  const date = new Date(time)
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
}

const quarterStart = cour => {
  const [year, quarter] = cour.split('-Q').map(Number)
  return Date.UTC(year, (quarter - 1) * 3, 1)
}

const quarterEnd = cour => {
  const [year, quarter] = cour.split('-Q').map(Number)
  return Date.UTC(year, quarter * 3, 1)
}

const coursBetween = (from, to) => {
  const cours = []
  let cursor = from
  for (let guard = 0; guard < 40 && cursor <= to; guard++) {
    const cour = courOfTime(cursor)
    cours.push(cour)
    cursor = quarterEnd(cour)
  }
  return cours
}

/** The quarters a run actually occupied, by how many weeks of each it used. */
const coursOfRun = (start, end) =>
  coursBetween(start, end)
    .map(cour => ({
      cour,
      weeks: Math.max(0, Math.min(end, quarterEnd(cour)) - Math.max(start, quarterStart(cour))) / (7 * DAY),
    }))
    .filter(span => span.weeks >= MIN_WEEKS_IN_COUR)
    .map(span => span.cour)

const analyse = record => {
  const episodes = episodesOf(record.episodes) ?? episodesOf(record.fields?.話数)
  if (!episodes || episodes <= ONE_COUR_MAX_EPISODES) return null

  const schedule = String(record.schedule ?? record.fields?.スケジュール ?? '')
  // A split run prints its halves on separate lines — "第1クール：2021年1月10日
  // ～3月22日" then "第2クール：2021年10月4日～". Reading first to last across
  // both would count the six months it was off the air as broadcast.
  const segments = schedule
    .split(/\r?\n/)
    .map(datesIn)
    .filter(dates => dates.length)
  if (!segments.length) return null

  const perPart = Math.round(episodes / segments.length)
  let repaired = false

  const parts = segments.map(dates => {
    const start = dates[0]
    // Weekly, so a run of N episodes takes about N weeks. Used when a segment
    // gives no end, and to correct one that lands before its own start — the
    // site writes 2022年10月5日～2022年2月15日 for a run that ended in 2023.
    const projected = start + (perPart - 1) * 7 * DAY
    let end = dates.length > 1 ? dates[dates.length - 1] : projected
    if (end < start) {
      end = projected
      repaired = true
    }
    // Each half of a split run is a cour of its own, so the same rule applies
    // to it as to a short season: the quarter it mostly ran in.
    const cours =
      perPart <= ONE_COUR_MAX_EPISODES
        ? [
            coursBetween(start, end)
              .map(cour => ({
                cour,
                weeks: Math.max(0, Math.min(end, quarterEnd(cour)) - Math.max(start, quarterStart(cour))),
              }))
              .reduce((best, span) => (span.weeks > best.weeks ? span : best)).cour,
          ]
        : coursOfRun(start, end)
    return { start, end, cours }
  })

  return {
    episodes,
    parts,
    repaired,
    cours: [...new Set(parts.flatMap(part => part.cours))].sort(),
  }
}

const recordsByTag = () => {
  const byTag = new Map()
  for (const file of readdirSync(WORKS_DIR).filter(name => name.endsWith('.yaml'))) {
    const doc = parse(readFileSync(`${WORKS_DIR}/${file}`, 'utf8'))
    for (const work of doc.works ?? []) {
      if (!work.workTagId) continue
      if (/再放送|総集編|新編集版|特別編|ダイジェスト/.test(work.title)) continue
      for (const tag of new Set([work.workTagId, work.seriesTagId].filter(Boolean))) {
        byTag.set(tag, [...(byTag.get(tag) ?? []), { cour: file.replace('.yaml', ''), ...work }])
      }
    }
  }
  return byTag
}

const iso = time => new Date(time).toISOString().slice(0, 10)

const main = async () => {
  const byTag = recordsByTag()
  const animes = await db.collection(ANIMES_PATH).get()

  const candidates = []
  let checked = 0

  for (const anime of animes.docs) {
    const tag = anime.get('metadata')?.animatetimes?.workTagId
    const records = tag ? byTag.get(tag) ?? [] : []
    const seasons = await anime.ref.collection('seasons').get()
    const held = new Set(seasons.docs.flatMap(season => season.get('cours') ?? []))

    for (const record of records) {
      const run = analyse(record)
      if (!run) continue
      checked++
      const missing = run.cours.filter(cour => !held.has(cour))
      if (!missing.length && !showAll) continue
      candidates.push({
        title: anime.get('name')?.ja,
        id: anime.id,
        record: record.title,
        run,
        held: [...held].sort(),
        missing,
      })
    }
  }

  // The site sometimes carries the same programme twice, once as "第2クール",
  // and both records describe the same broadcast.
  const byWork = new Map()
  for (const entry of candidates) {
    const existing = byWork.get(entry.id)
    if (!existing) byWork.set(entry.id, entry)
    else existing.missing = [...new Set([...existing.missing, ...entry.missing])].sort()
  }

  const unique = [...byWork.values()]
  const short = unique.filter(entry => entry.missing.length)

  for (const entry of showAll ? unique : short) {
    console.log(`${entry.missing.length ? '不足' : '充足'}  ${entry.title}  [${entry.id}]`)
    console.log(
      `      ${entry.record}  全${entry.run.episodes}話${entry.run.repaired ? '（終了日を話数から補正）' : ''}`
    )
    entry.run.parts.forEach(part =>
      console.log(`      ${iso(part.start)}〜${iso(part.end)}  ${JSON.stringify(part.cours)}`)
    )
    console.log(`      放送 ${JSON.stringify(entry.run.cours)}  DB ${JSON.stringify(entry.held)}`)
    if (entry.missing.length) console.log(`      不足 ${JSON.stringify(entry.missing)}`)
  }

  console.log(`\n15話以上のレコード ${checked}件 / 作品 ${unique.length}件 / 不足のある作品 ${short.length}件`)
  if (short.length) {
    console.log('\n調べ直すなら:')
    console.log(short.map(entry => `node scripts/recheck-cours.mjs --only ${entry.id}`).join('\n'))
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
