import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import {
  InvalidInput,
  buildAnimeWrite,
  parseCours,
  storeThumbnailFromUrl,
} from '@/lib/anime'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'
import { RATING_KEYS } from '@/lib/season'
import { invalidateAnimeCatalogue } from '@/lib/animeCatalogue'
import { invalidateSeasonIndex } from '@/lib/seasonIndex'
import { serializeAnime } from '@/app/api/v1/animes/serialize'
import {
  ANIME_LIST_MAX_PAGE_SIZE,
  ANIME_LIST_PAGE_SIZE,
  SORT_FIELDS,
  decodeAnimeListCursor,
  loadAnimeListPage,
} from '@/lib/animeListPage'
import type { SortKey } from '@/models/animeList'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  if (!(sort in SORT_FIELDS)) {
    return NextResponse.json(
      { error: `sort must be one of ${Object.keys(SORT_FIELDS).join(', ')}.` },
      { status: 400 }
    )
  }

  const cour = url.searchParams.get('cour')
  if (cour && !/^\d{4}-Q[1-4]$/.test(cour)) {
    return NextResponse.json({ error: 'cour must look like 2026-Q3.' }, { status: 400 })
  }

  const limit = Math.min(
    Number(url.searchParams.get('limit')) || ANIME_LIST_PAGE_SIZE,
    ANIME_LIST_MAX_PAGE_SIZE
  )

  const rawCursor = url.searchParams.get('cursor')
  const cursor = rawCursor ? decodeAnimeListCursor(rawCursor) : null
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: 'Invalid cursor.' }, { status: 400 })
  }

  try {
    const page = await loadAnimeListPage({ sort, cour, cursor, limit })
    return NextResponse.json(
      page,
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
