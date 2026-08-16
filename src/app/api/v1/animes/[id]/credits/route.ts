import { NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { InvalidInput, animeDoc } from '@/lib/anime'
import {
  EMPTY_CREDITS,
  buildCreditsWrite,
  creditsDoc,
  isLocale,
  serializeCredits,
} from '@/lib/credits'

/** ?lang=ja|en, defaulting to the language the site is written in. */
const localeOf = (request: Request) => {
  const raw = new URL(request.url).searchParams.get('lang') ?? 'ja'
  return isLocale(raw) ? raw : null
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Public: the work page shows all of this. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params
  const locale = localeOf(request)
  if (!locale) return NextResponse.json({ error: 'lang must be ja or en.' }, { status: 400 })

  try {
    const snapshot = await creditsDoc(id, locale).get()
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
  const locale = localeOf(request)
  if (!locale) return NextResponse.json({ error: 'lang must be ja or en.' }, { status: 400 })

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

    const input = (body ?? {}) as Record<string, unknown>
    const write = buildCreditsWrite(input)
    // Staff arrive as a complete set; the summary is written separately and
    // must survive a credits import that does not know about it.
    if (input.summary === undefined) {
      const existing = await creditsDoc(id, locale).get()
      const previous = existing.get('summary')
      write.summary =
        typeof previous === 'string' && previous.trim() ? previous.trim() : null
    }
    await creditsDoc(id, locale).set(write)

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
  const locale = localeOf(request)
  if (!locale) return NextResponse.json({ error: 'lang must be ja or en.' }, { status: 400 })

  try {
    await creditsDoc(id, locale).delete()
    return NextResponse.json({ id, locale, deleted: true })
  } catch (error) {
    console.error(`DELETE /api/v1/animes/${id}/credits failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
