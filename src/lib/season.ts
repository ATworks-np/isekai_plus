import 'server-only'

import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { InvalidInput, thumbnailUrlFor } from '@/lib/anime'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'

export const RATING_KEYS = ['story', 'character', 'animation', 'message', 'worldview'] as const
export type RatingKey = (typeof RATING_KEYS)[number]

/**
 * Seasons with no ratings are excluded from the series average. Including them
 * would drag it toward zero, which is the opposite of what a missing rating means.
 * Raise this if a floor on sample size is ever wanted — the series average is a
 * plain mean over seasons, so a single-vote season otherwise carries the same
 * weight as one with a hundred votes.
 */
const MIN_RATINGS_FOR_SERIES_AVERAGE = 1

export const seasonsCollection = (seriesId: string) =>
  adminDb().collection(`${ANIMES_PATH}/${seriesId}/seasons`)

export const seasonDoc = (seriesId: string, seasonId: string) =>
  adminDb().doc(`${ANIMES_PATH}/${seriesId}/seasons/${seasonId}`)

export const userRatingDoc = (seriesId: string, seasonId: string, uid: string) =>
  adminDb().doc(`${ANIMES_PATH}/${seriesId}/seasons/${seasonId}/userRatings/${uid}`)

export type SeasonRatings = Record<RatingKey, number>

const zeroRatings = (): SeasonRatings =>
  Object.fromEntries(RATING_KEYS.map(key => [key, 0])) as SeasonRatings

export const parseRatings = (value: unknown): SeasonRatings => {
  if (typeof value !== 'object' || value === null) {
    throw new InvalidInput('ratings must be an object with all five axes.')
  }
  const source = value as Record<string, unknown>
  const result = zeroRatings()

  for (const key of RATING_KEYS) {
    const raw = source[key]
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new InvalidInput(`ratings.${key} must be a number.`)
    }
    if (raw < 0 || raw > 5) throw new InvalidInput(`ratings.${key} must be between 0 and 5.`)
    result[key] = raw
  }
  return result
}

export type SeasonInput = {
  order?: unknown
  label?: unknown
  kind?: unknown
  cours?: unknown
  programId?: unknown
}

export const buildSeasonWrite = (input: SeasonInput, { partial }: { partial: boolean }) => {
  const write: Record<string, unknown> = {}

  if (input.order !== undefined || !partial) {
    const order = input.order
    if (typeof order !== 'number' || !Number.isInteger(order) || order < 1) {
      throw new InvalidInput('order must be a positive integer (1 for 第1期).')
    }
    write.order = order
  }

  // A season's label is 第1期, 第2期 and so on, which is its position among the
  // seasons — derived on read rather than stored, so it does not have to be
  // written correctly, kept correct when a season is inserted, or translated
  // 212 times. A spinoff is the exception: 「この素晴らしい世界に爆焔を！」 cannot
  // be worked out from a number, so it carries its own.
  const spinoff = input.kind === 'spinoff'
  if (input.label !== undefined || (!partial && spinoff)) {
    if (typeof input.label !== 'string' || !input.label.trim()) {
      throw new InvalidInput('label must be a non-empty string, e.g. この素晴らしい世界に爆焔を！.')
    }
    if (!spinoff) {
      throw new InvalidInput('label is only for kind="spinoff"; ordinary seasons are numbered from order.')
    }
    write.label = input.label.trim()
  }

  if (input.cours !== undefined || !partial) {
    if (!Array.isArray(input.cours)) throw new InvalidInput('cours must be an array of strings.')
    write.cours = input.cours.map((entry, i) => {
      if (typeof entry !== 'string' || !/^\d{4}-Q[1-4]$/.test(entry.trim())) {
        throw new InvalidInput(`cours[${i}] must look like 2026-Q3.`)
      }
      return entry.trim()
    })
  }

  if (input.programId !== undefined) {
    write.programId =
      input.programId === null ? null : String(input.programId).trim() || null
  }

  return write
}

const serializeOne = (doc: DocumentSnapshot, label: string) => {
  const data = doc.data() ?? {}
  // The parent id is the anime; a season's key visual is stored beneath it.
  const animeId = doc.ref.parent.parent?.id
  return {
    id: doc.id,
    thumbnailUrl: data.hasThumbnail && animeId ? thumbnailUrlFor(`${animeId}/${doc.id}`) : null,
    order: data.order ?? null,
    label,
    cours: data.cours ?? [],
    programId: data.programId ?? null,
    kind: data.kind ?? 'season',
    ratingCount: data.ratingCount ?? 0,
    ratings: (data.ratings ?? zeroRatings()) as SeasonRatings,
  }
}

/**
 * Numbers the seasons of one work.
 *
 * 第1期 is a position, not a name, so it is worked out here rather than stored
 * — and it is the position among the *seasons*: この素晴らしい世界に祝福を！ has
 * 爆焔 sitting at order 3, and the season after it is 第3期, not 第4期. A
 * spinoff keeps the label it was given, since no number describes it.
 *
 * Takes the whole set because a season cannot know its own number.
 */
export const serializeSeasons = (docs: DocumentSnapshot[]) => {
  const ordered = [...docs].sort((a, b) => (a.get('order') ?? 0) - (b.get('order') ?? 0))
  let numbered = 0
  return ordered.map(doc => {
    if ((doc.get('kind') ?? 'season') === 'spinoff') {
      return serializeOne(doc, doc.get('label') ?? '')
    }
    numbered += 1
    return serializeOne(doc, `第${numbered}期`)
  })
}

type SeasonAggregate = { id: string; ratingCount: number; ratings: SeasonRatings }

/**
 * The series score is the plain mean of its seasons' scores, so a weak sequel
 * pulls the series down regardless of how many people rated the strong season.
 * That is the intended behaviour, not an oversight.
 */
export const seriesRatingFields = (seasons: SeasonAggregate[]) => {
  const rated = seasons.filter(season => season.ratingCount >= MIN_RATINGS_FOR_SERIES_AVERAGE)
  const fields: Record<string, number> = {}

  for (const key of RATING_KEYS) {
    fields[`${key}Rating`] = rated.length
      ? rated.reduce((sum, season) => sum + (season.ratings?.[key] ?? 0), 0) / rated.length
      : 0
  }

  // One number to order by. Firestore cannot sort on the mean of five fields,
  // and the read API was computing it per response.
  fields.ratingAverage =
    RATING_KEYS.reduce((sum, key) => sum + fields[`${key}Rating`], 0) / RATING_KEYS.length

  return fields
}

/**
 * Recomputes the series aggregate from every season, substituting the season the
 * caller just changed. Reads happen before writes so this can run inside a
 * transaction, where Firestore forbids a read after a write.
 */
export const readSeasonAggregates = async (
  transaction: Transaction,
  seriesId: string
): Promise<SeasonAggregate[]> => {
  const snapshot = await transaction.get(seasonsCollection(seriesId))
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ratingCount: doc.get('ratingCount') ?? 0,
    ratings: (doc.get('ratings') ?? zeroRatings()) as SeasonRatings,
  }))
}

export const withSeasonReplaced = (
  aggregates: SeasonAggregate[],
  replacement: SeasonAggregate
): SeasonAggregate[] => {
  const next = aggregates.filter(season => season.id !== replacement.id)
  next.push(replacement)
  return next
}

export const removeSeason = (aggregates: SeasonAggregate[], seasonId: string) =>
  aggregates.filter(season => season.id !== seasonId)

export type { SeasonAggregate }
