import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { InvalidInput, buildAnimeWrite, latestCourOf, storeThumbnailFromUrl } from '@/lib/anime'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'
import { RATING_KEYS, serializeSeason } from '@/lib/season'
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

/**
 * The list, a page at a time.
 *
 * The page used to pull all 155 works and filter in the browser, then read
 * every like document of every row to show a count. Filtering and ordering
 * happen here now, against fields kept on the work: latestCour because
 * Firestore cannot order by the largest element of an array, likeCount and
 * ratingAverage because it cannot count a subcollection or average five fields.
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

  try {
    let query = adminDb()
      .collection(ANIMES_PATH)
      .orderBy(field, 'desc')
      // Ties are broken by id so a cursor always lands somewhere definite.
      .orderBy('__name__', 'desc')

    if (cour) query = query.where('cours', 'array-contains', cour)

    const rawCursor = url.searchParams.get('cursor')
    if (rawCursor) {
      const cursor = decodeCursor(rawCursor)
      if (!cursor) return NextResponse.json({ error: 'Invalid cursor.' }, { status: 400 })
      query = query.startAfter(cursor.v, cursor.id)
    }

    const snapshot = await query.limit(limit).get()

    const items = await Promise.all(
      snapshot.docs.map(async doc => {
        const seasons = await doc.ref.collection('seasons').orderBy('order').get()
        return {
          ...serializeAnime(doc),
          commentCount: doc.get('commentCount') ?? 0,
          likeCount: doc.get('likeCount') ?? 0,
          latestCour: doc.get('latestCour') ?? null,
          ratings: Object.fromEntries(
            RATING_KEYS.map(key => [key, doc.get(`${key}Rating`) ?? 0])
          ),
          rating: doc.get('ratingAverage') ?? 0,
          seasons: seasons.docs.map(serializeSeason),
        }
      })
    )

    const last = snapshot.docs[snapshot.docs.length - 1]
    return NextResponse.json({
      items,
      nextCursor:
        snapshot.size === limit && last ? encodeCursor(last.get(field), last.id) : null,
    })
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
    if (input.metadata !== undefined) {
      if (typeof input.metadata !== 'object' || input.metadata === null) {
        throw new InvalidInput('metadata must be an object.')
      }
      Object.assign(write, { metadata: input.metadata })
    }

    const ref = await adminDb().collection(ANIMES_PATH).add({
      ...write,
      latestCour: latestCourOf(write.cours),
      likeCount: 0,
      ratingAverage: 0,
    })

    // Ratings hang off a season, and the anime page draws its tabs from them,
    // so a work with none can never be rated. Every record carries at least one.
    await ref.collection('seasons').doc('season-1').set({
      order: 1,
      label: '第1期',
      kind: 'season',
      cours: write.cours ?? [],
      programId: null,
      ratingCount: 0,
      ratings: Object.fromEntries(RATING_KEYS.map(key => [key, 0])),
      ratingTotals: Object.fromEntries(RATING_KEYS.map(key => [key, 0])),
    })

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
    return NextResponse.json(serializeAnime(created), { status: 201 })
  } catch (error) {
    if (error instanceof InvalidInput) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/v1/animes failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
