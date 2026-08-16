import { NextResponse } from 'next/server'
import { serializeSeasons } from '@/lib/season'
import { seasonIndex } from '@/lib/seasonIndex'

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
    const index = await seasonIndex()
    const byAnime: Record<string, ReturnType<typeof serializeSeasons>> = {}
    for (const entry of index.values()) byAnime[entry.animeId] = serializeSeasons(entry.seasons)

    return NextResponse.json(
      { seasons: byAnime },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } }
    )
  } catch (error) {
    console.error('GET /api/v1/seasons failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
