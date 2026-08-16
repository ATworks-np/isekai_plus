import { NextResponse } from 'next/server'
import { animeCatalogue } from '@/lib/animeCatalogue'
import { RATING_KEYS } from '@/lib/season'
import { seasonIndex, workSeasons } from '@/lib/seasonIndex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Every work in one response.
 *
 * The paginated list is for readers scrolling; this is for the pages that need
 * the whole catalogue at once — the A-Z index, the sitemap — and for the build,
 * which cannot page through 155 works eight times over.
 *
 * Replaces the /statics endpoint on Cloud Functions. That one read the cours
 * off the work document, which no longer holds them; keeping both meant every
 * schema change had to be made twice.
 */
export async function GET() {
  try {
    const [index, catalogue] = await Promise.all([seasonIndex(), animeCatalogue()])

    const items = catalogue.docs.map(doc => {
      const entry = workSeasons(index, doc.id)
      return {
        id: doc.id,
        name: doc.get('name') ?? null,
        cours: entry.cours,
        latestCour: entry.latestCour,
        tags: (doc.get('tags') ?? []).map((tag: { path: string }) => tag.path),
        commentCount: doc.get('commentCount') ?? 0,
        likeCount: doc.get('likeCount') ?? 0,
        rating: doc.get('ratingAverage') ?? 0,
        ratings: Object.fromEntries(RATING_KEYS.map(key => [key, doc.get(`${key}Rating`) ?? 0])),
        ratingCount: entry.seasons.reduce(
          (sum, season) => sum + (season.get('ratingCount') ?? 0),
          0
        ),
      }
    })

    return NextResponse.json(items, {
      // The catalogue changes when a work is added, not between page views.
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    })
  } catch (error) {
    console.error('GET /api/v1/animes/statics failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
