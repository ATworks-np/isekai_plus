import { NextResponse } from 'next/server'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Just the ids, for generateStaticParams.
 *
 * The build asks which work pages to make, and nothing else about them, so it
 * gets a list of ids rather than 155 records it would throw away.
 */
export async function GET() {
  try {
    // select() with no fields returns documents carrying only their id.
    const snapshot = await adminDb().collection(ANIMES_PATH).select().get()
    return NextResponse.json(
      { ids: snapshot.docs.map(doc => doc.id) },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } }
    )
  } catch (error) {
    console.error('GET /api/v1/animes/ids failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
