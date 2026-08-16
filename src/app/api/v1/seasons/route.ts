import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { serializeSeasons } from '@/lib/season'

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

    // Grouped before serializing: a season is numbered by its position among
    // its own work's, so the set has to be together first.
    const docsByAnime = new Map<string, typeof snapshot.docs>()
    for (const doc of snapshot.docs) {
      const animeId = doc.ref.parent.parent?.id
      if (!animeId) continue
      docsByAnime.set(animeId, [...(docsByAnime.get(animeId) ?? []), doc])
    }

    const byAnime: Record<string, ReturnType<typeof serializeSeasons>> = {}
    for (const [animeId, docs] of docsByAnime) byAnime[animeId] = serializeSeasons(docs)

    return NextResponse.json({ seasons: byAnime })
  } catch (error) {
    console.error('GET /api/v1/seasons failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
