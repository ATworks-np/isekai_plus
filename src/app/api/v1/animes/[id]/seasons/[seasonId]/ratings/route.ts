import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { authenticateUser } from '@/lib/apiKey'
import { InvalidInput, animeDoc } from '@/lib/anime'
import { adminDb } from '@/lib/firebaseAdmin'
import {
  RATING_KEYS,
  SeasonRatings,
  parseRatings,
  seasonsCollection,
  seriesRatingFields,
  userRatingDoc,
  withSeasonReplaced,
} from '@/lib/season'
import { invalidateAnimeCatalogue } from '@/lib/animeCatalogue'
import { invalidateSeasonIndex } from '@/lib/seasonIndex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string; seasonId: string }> }

class NotFound extends Error {}

export async function GET(request: Request, context: Context) {
  const auth = await authenticateUser(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, seasonId } = await context.params

  try {
    const snapshot = await userRatingDoc(id, seasonId, auth.uid).get()
    const data = snapshot.data() ?? {}
    return NextResponse.json({
      rated: snapshot.exists,
      ratings: Object.fromEntries(RATING_KEYS.map(key => [key, data[key] ?? 0])),
    })
  } catch (error) {
    console.error(`GET ratings for ${id}/${seasonId} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

/**
 * Upserts one user's rating for one season and rolls the change all the way up
 * in a single transaction: user doc -> season totals/averages -> series average.
 * The old trigger chain did this asynchronously in three hops, where a failed
 * hop left the aggregates silently wrong.
 */
export async function PUT(request: Request, context: Context) {
  const auth = await authenticateUser(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, seasonId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  try {
    const next = parseRatings((body as { ratings?: unknown })?.ratings ?? body)
    const seriesRef = animeDoc(id)
    const ratingRef = userRatingDoc(id, seasonId, auth.uid)

    const result = await adminDb().runTransaction(async transaction => {
      // Every read must precede every write inside a Firestore transaction.
      const seriesSnap = await transaction.get(seriesRef)
      if (!seriesSnap.exists) throw new NotFound(`No anime with id ${id}.`)

      const seasonsSnap = await transaction.get(seasonsCollection(id))
      const target = seasonsSnap.docs.find(doc => doc.id === seasonId)
      if (!target) throw new NotFound(`No season ${seasonId} on anime ${id}.`)

      const previousSnap = await transaction.get(ratingRef)
      const previous = previousSnap.exists ? previousSnap.data() : null

      const totals = { ...(target.get('ratingTotals') ?? {}) } as Record<string, number>
      for (const key of RATING_KEYS) {
        totals[key] = (totals[key] ?? 0) - (previous?.[key] ?? 0) + next[key]
      }
      const ratingCount = (target.get('ratingCount') ?? 0) + (previous ? 0 : 1)

      const ratings = Object.fromEntries(
        RATING_KEYS.map(key => [key, ratingCount ? totals[key] / ratingCount : 0])
      ) as SeasonRatings

      transaction.set(
        ratingRef,
        {
          ...next,
          updatedAt: FieldValue.serverTimestamp(),
          ...(previous ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      )
      transaction.set(target.ref, { ratingTotals: totals, ratingCount, ratings }, { merge: true })

      const aggregates = seasonsSnap.docs.map(doc => ({
        id: doc.id,
        ratingCount: doc.get('ratingCount') ?? 0,
        ratings: (doc.get('ratings') ?? {}) as SeasonRatings,
      }))
      const series = seriesRatingFields(
        withSeasonReplaced(aggregates, { id: seasonId, ratingCount, ratings })
      )
      transaction.update(seriesRef, series)

      return { season: { ratingCount, ratings }, series }
    })

    invalidateSeasonIndex()
    invalidateAnimeCatalogue()
    return NextResponse.json({ ratings: next, ...result })
  } catch (error) {
    if (error instanceof NotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof InvalidInput) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error(`PUT ratings for ${id}/${seasonId} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
