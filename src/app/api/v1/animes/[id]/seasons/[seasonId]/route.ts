import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { InvalidInput, animeDoc } from '@/lib/anime'
import { adminDb } from '@/lib/firebaseAdmin'
import {
  buildSeasonWrite,
  readSeasonAggregates,
  removeSeason,
  seasonDoc,
  serializeSeason,
  seriesRatingFields,
} from '@/lib/season'

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

    const write = buildSeasonWrite((body ?? {}) as Record<string, unknown>, { partial: true })
    if (Object.keys(write).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    await ref.set(write, { merge: true })
    return NextResponse.json(serializeSeason(await ref.get()))
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

    // Dropping a season changes the series mean, so recompute it from what is
    // left before the season's own ratings disappear.
    await adminDb().runTransaction(async transaction => {
      const aggregates = await readSeasonAggregates(transaction, id)
      transaction.update(animeDoc(id), seriesRatingFields(removeSeason(aggregates, seasonId)))
    })

    // recursiveDelete takes the season's userRatings subcollection with it.
    await adminDb().recursiveDelete(ref)

    return NextResponse.json({ id: seasonId, deleted: true })
  } catch (error) {
    console.error(`DELETE /api/v1/animes/${id}/seasons/${seasonId} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
