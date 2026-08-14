import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { authenticateUser } from '@/lib/apiKey'
import { animeDoc } from '@/lib/anime'
import { adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Likes move through here rather than being written from the page so the count
 * can be kept on the work itself. The list sorts by it, and Firestore cannot
 * order by the size of a subcollection — the page was reading every like
 * document of every row just to show a number.
 */
const toggle = async (request: Request, context: Context, liked: boolean) => {
  const auth = await authenticateUser(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params

  try {
    const seriesRef = animeDoc(id)
    const likeRef = seriesRef.collection('likes').doc(auth.uid)

    const likeCount = await adminDb().runTransaction(async transaction => {
      const series = await transaction.get(seriesRef)
      if (!series.exists) throw new NotFound(`No anime with id ${id}.`)
      const existing = await transaction.get(likeRef)

      // Counted from the stored value, and only when the state actually
      // changes, so a double tap cannot drift it.
      const current = series.get('likeCount') ?? 0
      if (existing.exists === liked) return current

      if (liked) {
        transaction.set(likeRef, { userId: auth.uid, createdAt: FieldValue.serverTimestamp() })
      } else {
        transaction.delete(likeRef)
      }
      const next = Math.max(0, current + (liked ? 1 : -1))
      transaction.update(seriesRef, { likeCount: next })
      return next
    })

    return NextResponse.json({ id, liked, likeCount })
  } catch (error) {
    if (error instanceof NotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error(`${liked ? 'PUT' : 'DELETE'} likes for ${id} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

class NotFound extends Error {}

export async function GET(request: Request, context: Context) {
  const auth = await authenticateUser(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  try {
    const snapshot = await animeDoc(id).collection('likes').doc(auth.uid).get()
    return NextResponse.json({ id, liked: snapshot.exists })
  } catch (error) {
    console.error(`GET likes for ${id} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export const PUT = (request: Request, context: Context) => toggle(request, context, true)
export const DELETE = (request: Request, context: Context) => toggle(request, context, false)
