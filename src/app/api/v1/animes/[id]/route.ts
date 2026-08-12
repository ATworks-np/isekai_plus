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
import { serializeAnime } from '@/app/api/v1/animes/serialize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

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

    const write = await buildAnimeWrite(input, { partial: true })

    if (Object.keys(write).length === 0 && input.imageUrl === undefined) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    // Merge so the rating aggregates and commentCount maintained by the
    // Firestore triggers survive a partial update.
    if (Object.keys(write).length > 0) await ref.set(write, { merge: true })
    if (input.imageUrl !== undefined) await storeThumbnailFromUrl(id, input.imageUrl)

    return NextResponse.json(serializeAnime(await ref.get()))
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

    return NextResponse.json({ id, deleted: true })
  } catch (error) {
    console.error(`DELETE /api/v1/animes/${id} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
