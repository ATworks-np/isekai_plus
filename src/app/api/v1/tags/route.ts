import { NextResponse } from 'next/server'
import { TAGS_PATH, adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The tag vocabulary, as the list and the search box need it.
 *
 * Keyed by document path rather than by id, because a work stores its tags as
 * references and that is what the client has in hand.
 *
 * The criteria are left out: they are instructions for whoever is tagging, and
 * the reader has no use for a paragraph explaining when 巨乳メイド applies.
 */
export async function GET() {
  try {
    const snapshot = await adminDb().collection(TAGS_PATH).get()

    const tags = Object.fromEntries(
      snapshot.docs.map(doc => [
        doc.ref.path,
        {
          id: doc.id,
          name: doc.get('name') ?? null,
          group: doc.get('group') ?? null,
        },
      ])
    )

    return NextResponse.json(tags, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600' },
    })
  } catch (error) {
    console.error('GET /api/v1/tags failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
