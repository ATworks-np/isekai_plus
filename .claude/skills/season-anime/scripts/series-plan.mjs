#!/usr/bin/env node
/**
 * Works out where a programme sits in its series.
 *
 *   node series-plan.mjs 26812              # by animatetimes work id
 *   node series-plan.mjs --cour 2026-Q3 --title "幼女戦記Ⅱ"
 *
 * Prints the whole series in broadcast order, marking which entry was asked
 * about. Registering a sequel as 第1期 is the mistake this exists to prevent:
 * 幼女戦記Ⅱ, 乙女ゲー世界はモブに厳しい世界です2 and クレバテスII were all
 * filed as first seasons because nothing checked whether the source had
 * anything earlier under the same series.
 *
 * Output (JSON):
 *   {
 *     seriesTitle, seriesTagId,
 *     seasons: [{ order, label, kind, cours, workTagId, title, thumbnailUrl, isTarget }],
 *     target: { order, label, ... }
 *   }
 */

import { readFileSync, readdirSync } from 'fs'
import { parse } from 'yaml'

const WORKS_DIR = '.claude/skills/season-anime/data/works'
const RERUN = /(再放送|総集編|新編集版|再編集版|ダイジェスト)/

/**
 * Side stories, by work id. Nothing in a title separates these from a sequel
 * that happens to be subtitled — 最果てのパラディン 鉄錆の山の王 is a second
 * season, 転スラ日記 is not, and both read as "series title plus subtitle".
 * `spinoff` keeps its own name and sits out the numbering; `drop` is excluded.
 */
const SPINOFFS = {
  15487: 'spinoff', // この素晴らしい世界に爆焔を！
  13298: 'drop', // 転スラ日記
  19789: 'drop', // 転生したらスライムだった件 コリウスの夢
  14716: 'drop', // Re:ゼロから始める休憩時間
}

const normalize = title =>
  title
    .normalize('NFKC')
    .replace(/[〜～~]/g, '~')
    .replace(/\s+/g, '')
    .toLowerCase()

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

/** Every entry sharing a series with `anchor`, in either direction. */
const siblingsOf = (anchor, byTagId) => {
  const all = [...byTagId.values()]
  const ids = new Set([anchor.workTagId])

  if (anchor.seriesTagId) {
    ids.add(anchor.seriesTagId)
    all.filter(w => w.seriesTagId === anchor.seriesTagId).forEach(w => ids.add(w.workTagId))
  }
  all.filter(w => w.seriesTagId === anchor.workTagId).forEach(w => ids.add(w.workTagId))

  // A sibling found this way may carry a series tag the anchor lacked.
  for (const id of [...ids]) {
    const work = byTagId.get(id)
    if (!work?.seriesTagId) continue
    ids.add(work.seriesTagId)
    all.filter(w => w.seriesTagId === work.seriesTagId).forEach(w => ids.add(w.workTagId))
  }

  return [...ids]
    .map(id => byTagId.get(id))
    .filter(Boolean)
    .filter(w => !RERUN.test(w.title) && !RERUN.test(w.format ?? ''))
    .filter(w => w.cours.length)
    .filter(w => SPINOFFS[w.workTagId] !== 'drop')
    .sort((a, b) => a.cours[0].localeCompare(b.cours[0]))
}

const main = () => {
  const args = process.argv.slice(2)
  const byTagId = loadWorks()

  let anchor
  if (/^\d+$/.test(args[0] ?? '')) {
    anchor = byTagId.get(Number(args[0]))
    if (!anchor) throw new Error(`work id ${args[0]} がデータにありません`)
  } else {
    const cour = args[args.indexOf('--cour') + 1]
    const title = args[args.indexOf('--title') + 1]
    if (!cour || !title) throw new Error('Usage: series-plan.mjs <workTagId> | --cour <YYYY-QN> --title <題名>')
    const key = normalize(title)
    anchor = [...byTagId.values()].find(w => normalize(w.title) === key && w.cours.includes(cour))
    if (!anchor) throw new Error(`${cour} に "${title}" が見つかりません`)
  }

  const siblings = siblingsOf(anchor, byTagId)

  let number = 0
  const seasons = siblings.map((work, i) => {
    const spinoff = SPINOFFS[work.workTagId] === 'spinoff'
    if (!spinoff) number++
    return {
      order: i + 1,
      label: spinoff ? work.title : `第${number}期`,
      kind: spinoff ? 'spinoff' : 'season',
      cours: work.cours,
      workTagId: work.workTagId,
      title: work.title,
      thumbnailUrl: work.thumbnail?.url ?? null,
      isTarget: work.workTagId === anchor.workTagId,
    }
  })

  const named = siblings.find(w => w.seriesTitle)
  console.log(
    JSON.stringify(
      {
        seriesTitle: named?.seriesTitle ?? anchor.title,
        seriesTagId: named?.seriesTagId ?? null,
        allCours: [...new Set(seasons.flatMap(s => s.cours))].sort(),
        seasons,
        target: seasons.find(s => s.isTarget),
      },
      null,
      2
    )
  )
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
