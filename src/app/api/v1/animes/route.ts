import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import {
  InvalidInput,
  buildAnimeWrite,
  parseCours,
  storeThumbnailFromUrl,
} from '@/lib/anime'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'
import { RATING_KEYS, serializeSeasons } from '@/lib/season'
import { animeCatalogue, invalidateAnimeCatalogue } from '@/lib/animeCatalogue'
import { invalidateSeasonIndex, seasonIndex, workSeasons } from '@/lib/seasonIndex'
import { serializeAnime } from '@/app/api/v1/animes/serialize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/** Sort key -> the stored field it orders by. */
const SORTS = {
  recent: 'latestCour',
  likes: 'likeCount',
  comments: 'commentCount',
  rating: 'ratingAverage',
} as const

type SortKey = keyof typeof SORTS

const encodeCursor = (value: unknown, id: string) =>
  Buffer.from(JSON.stringify({ v: value ?? null, id })).toString('base64url')

const decodeCursor = (raw: string): { v: unknown; id: string } | null => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    return typeof parsed?.id === 'string' ? parsed : null
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

type Ranked = { id: string; value: string | number | null }

/**
 * The list, a page at a time.
 *
 * Ranked from the in-process catalogue so a page view does not scan Firestore.
 * The counts and the series average live on the work; the cours live on the
 * seasons, which is why both caches are needed to filter or to order by
 * broadcast date.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const sort = (url.searchParams.get('sort') ?? 'recent') as SortKey
  if (!(sort in SORTS)) {
    return NextResponse.json(
      { error: `sort must be one of ${Object.keys(SORTS).join(', ')}.` },
      { status: 400 }
    )
  }

  const cour = url.searchParams.get('cour')
  if (cour && !/^\d{4}-Q[1-4]$/.test(cour)) {
    return NextResponse.json({ error: 'cour must look like 2026-Q3.' }, { status: 400 })
  }

  const limit = Math.min(Number(url.searchParams.get('limit')) || PAGE_SIZE, MAX_PAGE_SIZE)
  const field = SORTS[sort]

  const rawCursor = url.searchParams.get('cursor')
  const cursor = rawCursor ? decodeCursor(rawCursor) : null
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: 'Invalid cursor.' }, { status: 400 })
  }

  try {
    // Ranked in memory off the cached catalogue: the home page used to fire a
    // collection scan, a collection-group scan and a paged query for one paint.
    const [index, catalogue] = await Promise.all([seasonIndex(), animeCatalogue()])

    const candidates = cour
      ? catalogue.docs.filter(doc => workSeasons(index, doc.id).cours.includes(cour))
      : catalogue.docs

    const ranked: Ranked[] = candidates.map(doc => ({
      id: doc.id,
      value: sort === 'recent' ? workSeasons(index, doc.id).latestCour : (doc.get(field) ?? 0),
    }))
    ranked.sort(compareDesc)

    // Positional rather than by index, so a work added or removed between
    // pages cannot make the cursor skip or repeat the rest of the list.
    const after = cursor
      ? ranked.filter(entry => compareDesc(entry, { id: cursor.id, value: cursor.v as never }) > 0)
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
        ratings: Object.fromEntries(RATING_KEYS.map(key => [key, doc.get(`${key}Rating`) ?? 0])),
        rating: doc.get('ratingAverage') ?? 0,
        seasons: serializeSeasons(entry.seasons),
      }
    })

    const last = page[page.length - 1]
    const lastValue =
      sort === 'recent' ? workSeasons(index, last?.id ?? '').latestCour : last?.get(field)

    return NextResponse.json(
      {
        items,
        nextCursor: hasMore && last ? encodeCursor(lastValue, last.id) : null,
      },
      { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' } }
    )
  } catch (error) {
    console.error('GET /api/v1/animes failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  const input = (body ?? {}) as Record<string, unknown>

  try {
    const write = await buildAnimeWrite(input, { partial: false })
    // cours belongs to a season, not to the work; here it seeds the first one.
    const cours = input.cours === undefined ? [] : parseCours(input.cours)
    if (input.metadata !== undefined) {
      if (typeof input.metadata !== 'object' || input.metadata === null) {
        throw new InvalidInput('metadata must be an object.')
      }
      Object.assign(write, { metadata: input.metadata })
    }

    const ref = await adminDb().collection(ANIMES_PATH).add({
      ...write,
      likeCount: 0,
      ratingAverage: 0,
    })

    // Ratings hang off a season, and the anime page draws its tabs from them,
    // so a work with none can never be rated. Every record carries at least one,
    // which is also what lets the season index stand in for the work list.
    await ref.collection('seasons').doc('season-1').set({
      order: 1,
      label: '第1期',
      kind: 'season',
      cours,
      programId: null,
      ratingCount: 0,
      ratings: Object.fromEntries(RATING_KEYS.map(key => [key, 0])),
      ratingTotals: Object.fromEntries(RATING_KEYS.map(key => [key, 0])),
    })
    invalidateSeasonIndex()
    invalidateAnimeCatalogue()

    if (input.imageUrl !== undefined) {
      try {
        await storeThumbnailFromUrl(ref.id, input.imageUrl)
      } catch (error) {
        // A record with no thumbnail renders as a broken tile everywhere, so the
        // create does not half-succeed.
        await ref.delete().catch(() => {})
        throw error
      }
    }

    const created = await ref.get()
    return NextResponse.json(serializeAnime(created, cours), { status: 201 })
  } catch (error) {
    if (error instanceof InvalidInput) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/v1/animes failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
