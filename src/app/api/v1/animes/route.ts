import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { InvalidInput, buildAnimeWrite, storeThumbnailFromUrl } from '@/lib/anime'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'
import { RATING_KEYS } from '@/lib/season'
import { serializeAnime } from '@/app/api/v1/animes/serialize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    const ref = await adminDb().collection(ANIMES_PATH).add(write)

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
