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
const useSeasons = (animeId: string | undefined) => {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [reloadToken, setReloadToken] = useState<number>(0)

  // Bumping a token rather than exposing the fetch itself keeps every state
  // update below the first await, where it is not a synchronous effect result.
  const reloadSeasons = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => {
    if (!animeId) return
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/v1/animes/${animeId}/seasons/`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (cancelled) return
        setSeasons(
          (data.seasons ?? []).map((season: Season) => ({
            ...season,
            ratings: { ...baseRatings, ...season.ratings },
          }))
        )
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
  }, [animeId, reloadToken])

  return { seasons, loading, reloadSeasons }
}

export default useSeasons
