import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { InvalidInput, animeDoc } from '@/lib/anime'
import {
  EMPTY_CREDITS,
  buildCreditsWrite,
  creditsDoc,
  serializeCredits,
} from '@/lib/credits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Public: the work page shows all of this. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params

  try {
    const snapshot = await creditsDoc(id).get()
    // A work with no credits recorded yet is not an error; the page just has
    // nothing to open.
    return NextResponse.json(snapshot.exists ? serializeCredits(snapshot) : EMPTY_CREDITS)
  } catch (error) {
    console.error(`GET /api/v1/animes/${id}/credits failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

/**
 * Replaces the record. Credits arrive as a set — a cast list merged with an
 * older one keeps actors the source has since corrected.
 */
export async function PUT(request: Request, context: Context) {
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

    const write = buildCreditsWrite((body ?? {}) as Record<string, unknown>)
    await creditsDoc(id).set(write)

    return NextResponse.json(write)
  } catch (error) {
    if (error instanceof InvalidInput) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error(`PUT /api/v1/animes/${id}/credits failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authenticateApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params

  try {
    await creditsDoc(id).delete()
    return NextResponse.json({ id, deleted: true })
  } catch (error) {
    console.error(`DELETE /api/v1/animes/${id}/credits failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
