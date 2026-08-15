#!/usr/bin/env node
/**
 * Checks a work's cours against what the web says, and checks the answer
 * against the pages it cites.
 *
 *   node scripts/recheck-cours.mjs                # ask (resumable)
 *   node scripts/recheck-cours.mjs --verify       # recheck cached answers' sources
 *   node scripts/recheck-cours.mjs --report       # compare what came back
 *   node scripts/recheck-cours.mjs --only <id>
 *
 * Three things had to be got right, in this order.
 *
 * Asking for cours got cours back, and a wrong one looked exactly like a right
 * one: 悪役令嬢転生おじさん came back as 2025-Q4 when the database's 2025-Q1 was
 * correct. So this asks for dates and episode counts and derives the cours
 * here, where a claim of two cours has to name a start, an end and a count that
 * agree with each other. Twelve to fourteen episodes is one cour whatever the
 * dates touch; 陰の実力者になりたくて！ at 全20話 from October cannot be.
 *
 * Restricting it to Wikipedia narrowed the sources without making them true —
 * ハズレ枠の【状態異常スキル】 came back with a second season that does not
 * exist, cited to a URL whose title had a character wrong. So the search is
 * open now, and every season has to carry a URL and a sentence quoted from it,
 * which this script fetches and looks for. An answer whose sources do not
 * check out is printed but not counted.
 *
 * Requires: gcloud auth application-default login, and grok on PATH.
 */

import { execFile } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { promisify } from 'util'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const run = promisify(execFile)

const ANIMES_PATH = 'versions/1/animes'
const FIRST_PASS_DIR = '.cache/grok'
const CACHE_DIR = '.cache/grok-web'
const CONCURRENCY = 3
const TIMEOUT_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 20 * 1000

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    seasons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' },
                episodes: { type: 'number' },
              },
              required: ['start', 'end', 'episodes'],
            },
          },
          isRerun: { type: 'boolean' },
          isSpinoff: { type: 'boolean' },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                quote: { type: 'string' },
              },
              required: ['url', 'quote'],
            },
          },
        },
        required: ['label', 'parts', 'isRerun', 'isSpinoff', 'evidence'],
      },
    },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['found', 'seasons', 'sources'],
})

const promptFor = (title, insist) => `「${title}」というテレビアニメの放送期間を、ウェブを検索して調べてください。

**必ず実際にページを開き、そこに書かれている文字を読んでから答えること。**
記憶で答えない。開いたページに無いことは書かない。
参照先は問わない（公式サイト、放送局、アニメ情報サイト、ニュース、Wikipedia など）。
複数のページで突き合わせ、食い違う場合は公式サイトを優先する。
${insist ? '前回この作品を「見つからない」と答えたが、実在する可能性が高い。検索語を変えて探し直すこと。\n' : ''}
- 期ごとに、放送の区切り（parts）を列挙する
  - start / end は YYYY-MM-DD。ページに書かれている放送開始日・最終回放送日をそのまま
  - episodes はその区切りの話数
- 連続2クール（例: 2023年10月6日〜2024年3月29日 全24話）は parts 1つ。start と end が離れる
- 分割放送（第1クールと第2クールの間が空く）は parts を2つに分ける
- 放送中で最終回が未定なら end は "" にする
- 再放送・総集編は isRerun=true
- スピンオフ・外伝（転生したらスライムだった件 に対する 転スラ日記 など）は
  本編の期に含めず isSpinoff=true の別項目にする
- 劇場版・OVA・配信限定は含めない

**evidence には、期ごとに「開いたページのURL」と「そのページに実際に書かれていた
一文」を入れること。** 引用はページ上の文字をそのまま写す。要約しない。
この引用はあとで機械的にページと照合するので、実在しない文を書くと検出される。

未放送・未発表の期を推測で足さないこと。根拠となる記述が見つからない期は
列挙しない。1期しか確認できなければ1期だけ返す。`

/** The model sometimes repeats its answer; take the first complete object. */
const firstJsonObject = text => {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

const ask = async (title, insist = false) => {
  const { stdout } = await run(
    'grok',
    ['-p', promptFor(title, insist), '--json-schema', SCHEMA, '--output-format', 'json'],
    { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  )
  const envelope = firstJsonObject(stdout)
  if (!envelope) throw new Error('grok の出力を解釈できませんでした')
  const answer = envelope.structuredOutput ?? firstJsonObject(envelope.text ?? '')
  if (!answer) throw new Error(envelope.structuredOutputError ?? '構造化出力が空でした')
  return { answer, costUsd: envelope.total_cost_usd ?? 0 }
}

/**
 * Checks an answer against the pages it says it read.
 *
 * A model asked for a source produces one whether or not it opened anything:
 * ハズレ枠の【状態異常スキル】 came back with a second season that does not
 * exist, cited to a wikipedia URL whose title had a character wrong. Fetching
 * the page and looking for the quoted sentence and the claimed dates catches
 * both halves of that — the URL that resolves to nothing, and the page that
 * resolves but says nothing of the sort.
 */
const stripHtml = html =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#\d+;|&[a-z]+;/gi, ' ')

/** Full width digits and every kind of space, so a quote matches its page. */
const normalize = text =>
  text
    .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')

const dateForms = iso => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!match) return []
  const [, year, month, day] = match
  const m = String(Number(month))
  const d = String(Number(day))
  return [`${year}年${m}月${d}日`, `${year}/${m}/${d}`, `${year}.${m}.${d}`, `${year}-${month}-${day}`]
}

const fetchPage = async url => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; isekai-plus-verifier/1.0)' },
    })
    const text = response.ok ? await response.text() : ''
    return { status: response.status, text }
  } finally {
    clearTimeout(timer)
  }
}

const verifySeason = async season => {
  const dates = (season.parts ?? [])
    .flatMap(part => [part.start, part.end])
    .filter(Boolean)
    .flatMap(dateForms)
    .map(normalize)

  const checks = []
  for (const evidence of season.evidence ?? []) {
    let status = 0
    let body = ''
    try {
      const page = await fetchPage(evidence.url)
      status = page.status
      body = normalize(stripHtml(page.text))
    } catch (error) {
      status = error.name === 'AbortError' ? 'timeout' : error.message.slice(0, 40)
    }
    // Twenty characters is enough to be specific and short enough to survive
    // the entities and markup a page puts through the middle of a sentence.
    const quote = normalize(evidence.quote ?? '').slice(0, 20)
    checks.push({
      url: evidence.url,
      status,
      quoteFound: Boolean(body && quote && body.includes(quote)),
      datesFound: dates.filter(date => body.includes(date)).length,
      datesTotal: dates.length,
    })
  }
  return checks
}

const verdictOf = checks => {
  if (!checks.length) return '出典なし'
  if (checks.some(check => check.quoteFound)) return '検証済み'
  if (checks.some(check => check.datesFound > 0)) return '日付のみ一致'
  if (checks.some(check => check.status === 200)) return '未検証（ページに記述なし）'
  return '到達不可'
}

const verifyAnswer = async answer => {
  const result = {}
  for (const [index, season] of (answer.seasons ?? []).entries()) {
    const checks = await verifySeason(season)
    result[index] = { checks, verdict: verdictOf(checks) }
  }
  return result
}

const courOf = date => {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '')
  if (!match) return null
  return `${match[1]}-Q${Math.floor((Number(match[2]) - 1) / 3) + 1}`
}

const courRange = (start, end) => {
  const from = courOf(start)
  if (!from) return []
  // A run still on air has no last episode; it covers up to the current cour.
  const to = courOf(end) ?? courOf(new Date().toISOString().slice(0, 10))
  const cours = []
  let [year, quarter] = from.split('-Q').map(Number)
  for (let guard = 0; guard < 40; guard++) {
    const cour = `${year}-Q${quarter}`
    cours.push(cour)
    if (cour === to) break
    if (++quarter > 4) {
      quarter = 1
      year++
    }
  }
  return cours
}

/**
 * Twelve to fourteen episodes is one cour, whatever the dates say.
 *
 * A run that starts in October ends in late December or the first days of
 * January, and that January episode does not make it a two cour show. Nor does
 * a September premiere make 葬送のフリーレン a summer series. So a quarter counts
 * only if the broadcast actually occupied it, measured in weeks.
 */
const ONE_COUR_MAX_EPISODES = 14
const MIN_WEEKS_IN_COUR = 3

const DAY = 24 * 60 * 60 * 1000

const quarterStart = cour => {
  const [year, quarter] = cour.split('-Q').map(Number)
  return Date.UTC(year, (quarter - 1) * 3, 1)
}

const quarterEnd = cour => {
  const [year, quarter] = cour.split('-Q').map(Number)
  return Date.UTC(year, quarter * 3, 1)
}

/**
 * How many weeks of each quarter the run covered. A part still on air has no
 * last episode, so the remaining episodes are projected weekly from the start.
 */
const weeksPerCour = part => {
  const from = Date.parse(part.start)
  if (Number.isNaN(from)) return []
  const projected = part.episodes ? from + (part.episodes - 1) * 7 * DAY : from
  const to = Date.parse(part.end) || projected
  if (Number.isNaN(to) || to < from) return []

  return courRange(part.start, new Date(to).toISOString().slice(0, 10)).map(cour => {
    const overlap = Math.min(to, quarterEnd(cour)) - Math.max(from, quarterStart(cour))
    return { cour, weeks: Math.max(0, overlap) / (7 * DAY) }
  })
}

const coursOfPart = part => {
  const spans = weeksPerCour(part)
  if (!spans.length) return []
  // Twelve episodes cannot fill two cours, so the one it mostly ran in wins.
  if (part.episodes && part.episodes <= ONE_COUR_MAX_EPISODES) {
    return [spans.reduce((best, span) => (span.weeks > best.weeks ? span : best)).cour]
  }
  return spans.filter(span => span.weeks >= MIN_WEEKS_IN_COUR).map(span => span.cour)
}

/** Cours a season aired in, derived from its parts rather than taken on trust. */
const coursOfSeason = season =>
  [...new Set((season.parts ?? []).flatMap(coursOfPart))].sort()

/** Where the episode count and the dates disagree, the answer is unreliable. */
const inconsistencies = season =>
  (season.parts ?? [])
    .map(part => {
      if (!part.episodes || !part.start) return null
      const weeks = weeksPerCour(part).reduce((sum, span) => sum + span.weeks, 0)
      // Weekly broadcast, so a run of N episodes occupies about N weeks. Far
      // fewer means the dates are wrong; far more means breaks, or a wrong count.
      if (part.end && weeks < part.episodes - 3) {
        return `全${part.episodes}話に対し放送期間が${weeks.toFixed(0)}週しかない（${part.start}〜${part.end}）`
      }
      if (part.end && weeks > part.episodes + 6) {
        return `全${part.episodes}話に対し放送期間が${weeks.toFixed(0)}週と長い（${part.start}〜${part.end}）。中断か分割の可能性`
      }
      return null
    })
    .filter(Boolean)

const spansOf = season =>
  (season.parts ?? [])
    .flatMap(weeksPerCour)
    .map(span => `${span.cour}(${span.weeks.toFixed(1)}週)`)
    .join(' ')

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

const loadWorks = async () => {
  const animes = await db.collection(ANIMES_PATH).get()
  const works = []
  for (const anime of animes.docs) {
    const seasons = await anime.ref.collection('seasons').orderBy('order').get()
    works.push({
      id: anime.id,
      title: anime.get('name')?.ja ?? '',
      seasons: seasons.docs.map(season => ({
        id: season.id,
        label: season.get('label'),
        kind: season.get('kind') ?? 'season',
        cours: [...(season.get('cours') ?? [])].sort(),
      })),
      get cours() {
        return [...new Set(this.seasons.flatMap(season => season.cours))].sort()
      },
    })
  }
  return works
}

/** The works the first pass flagged as missing cours and nothing else. */
const targets = works =>
  works.filter(work => {
    const path = `${FIRST_PASS_DIR}/${work.id}.json`
    if (!existsSync(path)) return false
    const cached = JSON.parse(readFileSync(path, 'utf8'))
    if (cached.error || !cached.answer?.found) return false
    const wiki = [
      ...new Set(cached.answer.seasons.filter(s => !s.isRerun).flatMap(s => s.cours)),
    ].sort()
    if (!wiki.length) return false
    const missing = wiki.filter(cour => !work.cours.includes(cour))
    const extra = work.cours.filter(cour => !wiki.includes(cour))
    return missing.length > 0 && extra.length === 0
  })

const report = works => {
  for (const work of works) {
    const path = `${CACHE_DIR}/${work.id}.json`
    if (!existsSync(path)) continue
    const cached = JSON.parse(readFileSync(path, 'utf8'))

    console.log(`=== ${work.title}  [${work.id}]`)
    console.log(`  DB  : ${JSON.stringify(work.cours)}`)
    work.seasons.forEach(season =>
      console.log(`        ${season.label}${season.kind === 'spinoff' ? '(外伝)' : ''} ${JSON.stringify(season.cours)}`)
    )

    if (cached.error) {
      console.log(`  失敗: ${cached.error}\n`)
      continue
    }
    if (!cached.answer.found) {
      console.log('  該当なし\n')
      continue
    }

    // A season whose sources could not be checked does not get to move the
    // database. Everything is printed, but only the verified is counted.
    const verification = cached.verification ?? {}
    const trusted = cached.answer.seasons.filter(
      (_, index) => (verification[index]?.verdict ?? '出典なし') !== '出典なし'
        && verification[index]?.verdict !== '到達不可'
        && verification[index]?.verdict !== '未検証（ページに記述なし）'
    )

    const broadcast = trusted.filter(s => !s.isRerun && !s.isSpinoff)
    const found = [...new Set(broadcast.flatMap(coursOfSeason))].sort()
    console.log(`  Web : ${JSON.stringify(found)}`)
    for (const [index, season] of cached.answer.seasons.entries()) {
      const mark = season.isRerun ? '再放送' : season.isSpinoff ? '外伝' : ''
      const parts = (season.parts ?? [])
        .map(part => `${part.start}〜${part.end || '放送中'} 全${part.episodes}話`)
        .join(' / ')
      const verdict = verification[index]?.verdict ?? '未実行'
      console.log(`        ${season.label}${mark ? `(${mark})` : ''} ${JSON.stringify(coursOfSeason(season))}  ${parts}  [${verdict}]`)
      console.log(`          内訳 ${spansOf(season)}`)
      for (const check of verification[index]?.checks ?? []) {
        console.log(
          `          出典 ${check.status} 引用${check.quoteFound ? '一致' : '不一致'} 日付${check.datesFound}/${check.datesTotal}  ${check.url.slice(0, 70)}`
        )
      }
      inconsistencies(season).forEach(warning => console.log(`          ⚠ ${warning}`))
    }

    const missing = found.filter(cour => !work.cours.includes(cour))
    const extra = work.cours.filter(cour => !found.includes(cour))
    console.log(`  差分: 不足 ${JSON.stringify(missing)}  余分 ${JSON.stringify(extra)}\n`)
  }
}

const main = async () => {
  mkdirSync(CACHE_DIR, { recursive: true })
  const works = await loadWorks()
  const onlyAt = process.argv.indexOf('--only')
  const only = onlyAt === -1 ? null : process.argv[onlyAt + 1]
  const selected = only ? works.filter(work => work.id === only) : targets(works)

  if (process.argv.includes('--report')) return report(selected)

  // Re-checks the sources of answers already cached, without asking again.
  if (process.argv.includes('--verify')) {
    for (const work of selected) {
      const path = `${CACHE_DIR}/${work.id}.json`
      if (!existsSync(path)) continue
      const cached = JSON.parse(readFileSync(path, 'utf8'))
      if (cached.error || !cached.answer?.found) continue
      cached.verification = await verifyAnswer(cached.answer)
      writeFileSync(path, JSON.stringify(cached, null, 2))
      const verdicts = Object.values(cached.verification).map(entry => entry.verdict)
      console.log(`${work.title.slice(0, 30)}  ${verdicts.join(' / ')}`)
    }
    return
  }

  const pending = selected.filter(work => only || !existsSync(`${CACHE_DIR}/${work.id}.json`))
  console.log(`対象 ${selected.length}件 / これから ${pending.length}件\n`)

  let index = 0
  let spent = 0
  let failed = 0

  const worker = async () => {
    while (index < pending.length) {
      const work = pending[index++]
      const position = index
      try {
        let { answer, costUsd } = await ask(work.title)
        if (!answer.found || answer.seasons.length === 0) {
          const retry = await ask(work.title, true)
          costUsd += retry.costUsd
          if (retry.answer.found && retry.answer.seasons.length) answer = retry.answer
        }
        spent += costUsd
        // Checked here rather than at report time: the answer and the state of
        // the pages it cites belong to the same moment.
        const verification = await verifyAnswer(answer)
        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify({ title: work.title, answer, verification, costUsd }, null, 2)
        )
        const cours = [
          ...new Set(
            answer.seasons.filter(s => !s.isRerun && !s.isSpinoff).flatMap(coursOfSeason)
          ),
        ].sort()
        const verdicts = Object.values(verification).map(entry => entry.verdict)
        console.log(
          `[${position}/${pending.length}] ${work.title.slice(0, 26)}  -> ${JSON.stringify(cours)}  [${verdicts.join(' / ')}]  ($${spent.toFixed(2)})`
        )
      } catch (error) {
        failed++
        writeFileSync(
          `${CACHE_DIR}/${work.id}.json`,
          JSON.stringify({ title: work.title, error: error.message }, null, 2)
        )
        console.log(`[${position}/${pending.length}] ${work.title.slice(0, 26)}  FAILED: ${error.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))
  console.log(`\n完了。失敗 ${failed}件 / 概算 $${spent.toFixed(2)}`)
  console.log('--report で DB と照合できます')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
