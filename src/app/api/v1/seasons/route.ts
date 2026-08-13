import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { serializeSeason } from '@/lib/season'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Every season on the site, grouped by anime.
 *
 * The list page needs each work's seasons to pick the right key visual and
 * label, and asking per card would be one request per row. A collection group
 * query fetches the lot in one, which at 184 seasons is a smaller payload than
 * the work list it accompanies.
 */
export async function GET() {
  try {
    const snapshot = await adminDb().collectionGroup('seasons').get()

    const byAnime: Record<string, ReturnType<typeof serializeSeason>[]> = {}
    for (const doc of snapshot.docs) {
      const animeId = doc.ref.parent.parent?.id
      if (!animeId) continue
      ;(byAnime[animeId] ??= []).push(serializeSeason(doc))
    }
    for (const seasons of Object.values(byAnime)) {
      seasons.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }

    return NextResponse.json({ seasons: byAnime })
  } catch (error) {
    console.error('GET /api/v1/seasons failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
