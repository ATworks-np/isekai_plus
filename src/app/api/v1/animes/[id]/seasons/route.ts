import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { InvalidInput, animeDoc } from '@/lib/anime'
import { RATING_KEYS, buildSeasonWrite, seasonsCollection, serializeSeason } from '@/lib/season'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Public: the anime page renders the season tabs from this, and seasons carry
 * nothing the site does not already publish. Writes below still need a key.
 */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params

  try {
    if (!(await animeDoc(id).get()).exists) {
      return NextResponse.json({ error: `No anime with id ${id}.` }, { status: 404 })
    }
    const snapshot = await seasonsCollection(id).orderBy('order').get()
    return NextResponse.json({ seasons: snapshot.docs.map(serializeSeason) })
  } catch (error) {
    console.error(`GET /api/v1/animes/${id}/seasons failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function POST(request: Request, context: Context) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  try {
    if (!(await animeDoc(id).get()).exists) {
      return NextResponse.json({ error: `No anime with id ${id}.` }, { status: 404 })
    }

    const write = buildSeasonWrite((body ?? {}) as Record<string, unknown>, { partial: false })

    // order identifies the season to humans ("第2期"), so a duplicate would make
    // the tab strip ambiguous.
    const clash = await seasonsCollection(id).where('order', '==', write.order).limit(1).get()
    if (!clash.empty) {
      return NextResponse.json(
        { error: `This series already has a season with order ${write.order}.` },
        { status: 409 }
      )
    }

    const ref = await seasonsCollection(id).add({
      ...write,
      ratingCount: 0,
      ratings: Object.fromEntries(RATING_KEYS.map(key => [key, 0])),
      ratingTotals: Object.fromEntries(RATING_KEYS.map(key => [key, 0])),
    })

    return NextResponse.json(serializeSeason(await ref.get()), { status: 201 })
  } catch (error) {
    if (error instanceof InvalidInput) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error(`POST /api/v1/animes/${id}/seasons failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
