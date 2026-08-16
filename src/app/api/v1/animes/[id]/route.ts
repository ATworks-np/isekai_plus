import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import {
  InvalidInput,
  animeDoc,
  buildAnimeWrite,
  deleteThumbnails,
  storeThumbnailFromUrl,
} from '@/lib/anime'
import { adminDb } from '@/lib/firebaseAdmin'
import { animeCatalogue, invalidateAnimeCatalogue } from '@/lib/animeCatalogue'
import { seasonsCollection } from '@/lib/season'
import { invalidateSeasonIndex, seasonIndex, workSeasons } from '@/lib/seasonIndex'
import { serializeAnime } from '@/app/api/v1/animes/serialize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * One work, for the page that is about it.
 *
 * Public: everything here is on the page already. Replaces the /:id/statics
 * endpoint on Cloud Functions, which read the cours off the work document —
 * they live on the seasons now, and keeping both readers meant fixing the same
 * thing twice.
 */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params

  try {
    const [catalogue, index] = await Promise.all([animeCatalogue(), seasonIndex()])
    const doc = catalogue.byId.get(id)
    if (!doc) return NextResponse.json({ error: `No anime with id ${id}.` }, { status: 404 })

    const entry = workSeasons(index, id)
    return NextResponse.json(
      {
        ...serializeAnime(doc, entry.cours),
        rating: doc.get('ratingAverage') ?? 0,
        // Summed over the seasons: the work itself does not count votes.
        ratingCount: entry.seasons.reduce((sum, season) => sum + (season.get('ratingCount') ?? 0), 0),
        commentCount: doc.get('commentCount') ?? 0,
        likeCount: doc.get('likeCount') ?? 0,
      },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } }
    )
  } catch (error) {
    console.error(`GET /api/v1/animes/${id} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  const input = (body ?? {}) as Record<string, unknown>

  try {
    const ref = animeDoc(id)
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: `No anime with id ${id}.` }, { status: 404 })
    }

    // Which cours a work aired in is a property of its seasons, and patching a
    // copy on the work was how the two came to disagree.
    if (input.cours !== undefined) {
      return NextResponse.json(
        { error: 'cours belongs to a season. Use /api/v1/animes/<id>/seasons/<seasonId>.' },
        { status: 400 }
      )
    }

    const write = await buildAnimeWrite(input, { partial: true })

    if (Object.keys(write).length === 0 && input.imageUrl === undefined) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    // Merge so the rating aggregates and commentCount maintained by the
    // Firestore triggers survive a partial update.
    if (Object.keys(write).length > 0) await ref.set(write, { merge: true })
    if (input.imageUrl !== undefined) await storeThumbnailFromUrl(id, input.imageUrl)
    invalidateAnimeCatalogue()

    const seasons = await seasonsCollection(id).get()
    const cours = [
      ...new Set(seasons.docs.flatMap(season => (season.get('cours') ?? []) as string[])),
    ].sort()

    return NextResponse.json(serializeAnime(await ref.get(), cours))
  } catch (error) {
    if (error instanceof InvalidInput) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error(`PATCH /api/v1/animes/${id} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params

  try {
    const ref = animeDoc(id)
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: `No anime with id ${id}.` }, { status: 404 })
    }

    // Deleting a document leaves its subcollections orphaned in Firestore, and
    // this one owns comments, likes and per-user ratings.
    await adminDb().recursiveDelete(ref)
    await deleteThumbnails(id)
    invalidateSeasonIndex()
    invalidateAnimeCatalogue()

    return NextResponse.json({ id, deleted: true })
  } catch (error) {
    console.error(`DELETE /api/v1/animes/${id} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
