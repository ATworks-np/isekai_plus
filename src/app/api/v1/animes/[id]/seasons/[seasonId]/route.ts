import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { InvalidInput, animeDoc, deleteThumbnails, storeThumbnailFromUrl } from '@/lib/anime'
import { adminDb } from '@/lib/firebaseAdmin'
import {
  buildSeasonWrite,
  readSeasonAggregates,
  removeSeason,
  seasonDoc,
  seasonsCollection,
  serializeSeasons,
  seriesRatingFields,
} from '@/lib/season'
import { invalidateAnimeCatalogue } from '@/lib/animeCatalogue'
import { invalidateSeasonIndex } from '@/lib/seasonIndex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string; seasonId: string }> }

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, seasonId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  try {
    const ref = seasonDoc(id, seasonId)
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: `No season ${seasonId} on anime ${id}.` }, { status: 404 })
    }

    const input = (body ?? {}) as Record<string, unknown>
    const write = buildSeasonWrite(input, { partial: true })
    if (Object.keys(write).length === 0 && input.imageUrl === undefined) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    if (Object.keys(write).length > 0) await ref.set(write, { merge: true })
    if (input.imageUrl !== undefined) {
      await storeThumbnailFromUrl(`${id}/${seasonId}`, input.imageUrl)
      await ref.update({ hasThumbnail: true })
    }
    invalidateSeasonIndex()
    invalidateAnimeCatalogue()
    const siblings = await seasonsCollection(id).get()
    return NextResponse.json(serializeSeasons(siblings.docs).find(season => season.id === seasonId))
  } catch (error) {
    if (error instanceof InvalidInput) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error(`PATCH /api/v1/animes/${id}/seasons/${seasonId} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, seasonId } = await context.params

  try {
    const ref = seasonDoc(id, seasonId)
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: `No season ${seasonId} on anime ${id}.` }, { status: 404 })
    }

    // A work is listed and filtered through its seasons, so one with none would
    // disappear from the site while still existing. Delete the work instead.
    const siblings = await seasonsCollection(id).get()
    if (siblings.size <= 1) {
      return NextResponse.json(
        { error: 'A work must keep at least one season. Delete the work itself instead.' },
        { status: 409 }
      )
    }

    // Dropping a season changes the series mean, so recompute it from what is
    // left before the season's own ratings disappear.
    await adminDb().runTransaction(async transaction => {
      const aggregates = await readSeasonAggregates(transaction, id)
      transaction.update(animeDoc(id), seriesRatingFields(removeSeason(aggregates, seasonId)))
    })

    // recursiveDelete takes the season's userRatings subcollection with it.
    await adminDb().recursiveDelete(ref)
    await deleteThumbnails(`${id}/${seasonId}`)
    invalidateSeasonIndex()
    invalidateAnimeCatalogue()

    return NextResponse.json({ id: seasonId, deleted: true })
  } catch (error) {
    console.error(`DELETE /api/v1/animes/${id}/seasons/${seasonId} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
