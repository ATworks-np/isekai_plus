import 'server-only'

import { animeCatalogue } from '@/lib/animeCatalogue'
import { RATING_KEYS, serializeSeasons } from '@/lib/season'
import { seasonIndex, workSeasons } from '@/lib/seasonIndex'
import { serializeAnime } from '@/app/api/v1/animes/serialize'
import type { AnimeListPage, SortKey } from '@/models/animeList'
import type { IRatings } from '@/models/interfaces/ratings'

export const ANIME_LIST_PAGE_SIZE = 20
export const ANIME_LIST_MAX_PAGE_SIZE = 50

export const SORT_FIELDS = {
  recent: 'latestCour',
  likes: 'likeCount',
  comments: 'commentCount',
  rating: 'ratingAverage',
} as const satisfies Record<SortKey, string>

export type AnimeListCursor = { value: unknown; id: string }
type Ranked = { id: string; value: string | number | null }

export const encodeAnimeListCursor = (value: unknown, id: string) =>
  Buffer.from(JSON.stringify({ v: value ?? null, id })).toString('base64url')

export const decodeAnimeListCursor = (raw: string): AnimeListCursor | null => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    return typeof parsed?.id === 'string' ? { value: parsed.v, id: parsed.id } : null
  } catch {
    return null
  }
}

/** Firestore's order: value descending, ties broken by id descending. */
const compareDesc = (a: Ranked, b: Ranked) => {
  const left = a.value ?? ''
  const right = b.value ?? ''
  if (left < right) return 1
  if (left > right) return -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/**
 * One list page shared by the public API and the server-rendered home page.
 * Keeping the ranking here guarantees that hydration starts with exactly the
 * same rows and cursor the browser would have fetched for itself.
 */
export const loadAnimeListPage = async ({
  sort,
  cour = null,
  cursor = null,
  limit = ANIME_LIST_PAGE_SIZE,
}: {
  sort: SortKey
  cour?: string | null
  cursor?: AnimeListCursor | null
  limit?: number
}): Promise<AnimeListPage> => {
  const field = SORT_FIELDS[sort]
  const [index, catalogue] = await Promise.all([seasonIndex(), animeCatalogue()])

  const candidates = cour
    ? catalogue.docs.filter(doc => workSeasons(index, doc.id).cours.includes(cour))
    : catalogue.docs

  const ranked: Ranked[] = candidates.map(doc => ({
    id: doc.id,
    value: sort === 'recent' ? workSeasons(index, doc.id).latestCour : (doc.get(field) ?? 0),
  }))
  ranked.sort(compareDesc)

  const after = cursor
    ? ranked.filter(entry =>
        compareDesc(entry, { id: cursor.id, value: cursor.value as Ranked['value'] }) > 0
      )
    : ranked

  const wanted = after.slice(0, limit)
  const hasMore = after.length > wanted.length
  const page = wanted.map(entry => catalogue.byId.get(entry.id)!).filter(doc => doc.exists)

  const items = page.map(doc => {
    const entry = workSeasons(index, doc.id)
    return {
      ...serializeAnime(doc, entry.cours),
      commentCount: doc.get('commentCount') ?? 0,
      likeCount: doc.get('likeCount') ?? 0,
      latestCour: entry.latestCour,
      ratings: Object.fromEntries(
        RATING_KEYS.map(key => [key, doc.get(`${key}Rating`) ?? 0])
      ) as IRatings,
      rating: doc.get('ratingAverage') ?? 0,
      seasons: serializeSeasons(entry.seasons),
    }
  })

  const last = page[page.length - 1]
  const lastValue =
    sort === 'recent' ? workSeasons(index, last?.id ?? '').latestCour : last?.get(field)

  return {
    items,
    nextCursor: hasMore && last ? encodeAnimeListCursor(lastValue, last.id) : null,
  }
}
