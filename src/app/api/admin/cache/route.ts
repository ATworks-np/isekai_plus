import { NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/apiKey'
import { invalidateReadCaches } from '@/lib/readCaches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The read functions hold their responses in module scope, so a newly added
 * work stays invisible on the list page until the instance restarts. Each
 * exposes a clear query parameter; this calls them from the server so the token
 * is not shipped in the client bundle.
 */
const TARGETS = [
  { name: '作品一覧', url: 'https://animes-mu4s3uqxga-uc.a.run.app/' },
  { name: 'タグ一覧', url: 'https://tags-1083169622055.us-central1.run.app/' },
]

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  invalidateReadCaches()

  const token = process.env.FUNCTIONS_CACHE_CLEAR_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'FUNCTIONS_CACHE_CLEAR_TOKEN is not configured.' },
      { status: 500 }
    )
  }

  const results = await Promise.all(
    TARGETS.map(async target => {
      try {
        const response = await fetch(`${target.url}?clear=${encodeURIComponent(token)}`, {
          signal: AbortSignal.timeout(60_000),
        })
        return { name: target.name, ok: response.ok, status: response.status }
      } catch (error) {
        return {
          name: target.name,
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })
  )

  const all = [{ name: 'Next 読み取り', ok: true, status: 200 }, ...results]
  const failed = all.filter(result => !result.ok)
  return NextResponse.json({ results: all }, { status: failed.length ? 502 : 200 })
}
