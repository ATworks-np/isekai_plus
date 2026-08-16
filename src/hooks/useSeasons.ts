'use client'

import { useCallback, useEffect, useState } from 'react'
import { IRatings, baseRatings } from '@/models/interfaces/ratings'

export type Season = {
  id: string
  order: number | null
  label: string
  seasonNumber: number | null
  kind: 'season' | 'spinoff'
  thumbnailUrl: string | null
  cours: string[]
  programId: string | null
  ratingCount: number
  ratings: IRatings
}

/**
 * Seasons come from the app's own route handler rather than Firestore, so the
 * client never sees the aggregate documents it is not allowed to write.
 */
const normalizeSeasons = (seasons: Season[]) =>
  seasons.map(season => ({
    ...season,
    ratings: { ...baseRatings, ...season.ratings },
  }))

const useSeasons = (animeId: string | undefined, initialSeasons?: Season[]) => {
  const [seasons, setSeasons] = useState<Season[]>(() =>
    normalizeSeasons(initialSeasons ?? [])
  )
  const [loading, setLoading] = useState<boolean>(initialSeasons === undefined)
  const [reloadToken, setReloadToken] = useState<number>(0)

  // Bumping a token rather than exposing the fetch itself keeps every state
  // update below the first await, where it is not a synchronous effect result.
  const reloadSeasons = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => {
    if (!animeId) return
    // The public data already arrived with the server-rendered page. A fetch is
    // only needed after the reader saves a rating and asks for fresh totals.
    if (initialSeasons !== undefined && reloadToken === 0) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/v1/animes/${animeId}/seasons/`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (cancelled) return
        setSeasons(normalizeSeasons(data.seasons ?? []))
      } catch (error) {
        if (!cancelled) console.error('シーズンの取得に失敗しました', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [animeId, initialSeasons, reloadToken])

  return { seasons, loading, reloadSeasons }
}

export default useSeasons
