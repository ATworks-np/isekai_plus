import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { InvalidInput, animeDoc, storeThumbnailFromUrl } from '@/lib/anime'
import { RATING_KEYS, buildSeasonWrite, seasonsCollection, serializeSeasons } from '@/lib/season'
import { animeCatalogue, invalidateAnimeCatalogue } from '@/lib/animeCatalogue'
import { invalidateSeasonIndex, seasonIndex, workSeasons } from '@/lib/seasonIndex'

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
    const [catalogue, index] = await Promise.all([animeCatalogue(), seasonIndex()])
    if (!catalogue.byId.has(id)) {
      return NextResponse.json({ error: `No anime with id ${id}.` }, { status: 404 })
    }
    return NextResponse.json(
      { seasons: serializeSeasons(workSeasons(index, id).seasons) },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } }
    )
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
      kind: (body as { kind?: string })?.kind === 'spinoff' ? 'spinoff' : 'season',
      ratingCount: 0,
      ratings: Object.fromEntries(RATING_KEYS.map(key => [key, 0])),
      ratingTotals: Object.fromEntries(RATING_KEYS.map(key => [key, 0])),
    })

    const input = (body ?? {}) as Record<string, unknown>
    if (input.imageUrl !== undefined) {
      try {
        await storeThumbnailFromUrl(`${id}/${ref.id}`, input.imageUrl)
        await ref.update({ hasThumbnail: true })
      } catch (error) {
        await ref.delete().catch(() => {})
        throw error
      }
    }

    invalidateSeasonIndex()
    invalidateAnimeCatalogue()
    // Re-read the set: the new season's number depends on its siblings.
    const siblings = await seasonsCollection(id).get()
    const created = serializeSeasons(siblings.docs).find(season => season.id === ref.id)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof InvalidInput) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error(`POST /api/v1/animes/${id}/seasons failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
