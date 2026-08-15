'use client'

import { useEffect, useState } from 'react'

export type StaffEntry = { role: string; name: string }
export type CastEntry = { character: string; name: string }
export type ThemeSong = { type: string; title: string; artist: string }

export type Credits = {
  studios: string[]
  staff: StaffEntry[]
  cast: CastEntry[]
  themeSongs: ThemeSong[]
  source: string | null
}

const EMPTY: Credits = { studios: [], staff: [], cast: [], themeSongs: [], source: null }

/**
 * Fetched on mount rather than when the accordion opens: the panels have to
 * know whether there is anything to show before the reader clicks, and the
 * record is one small document.
 */
const useCredits = (animeId: string | undefined) => {
  const [credits, setCredits] = useState<Credits>(EMPTY)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!animeId) return
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/v1/animes/${animeId}/credits/`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as Credits
        if (!cancelled) setCredits({ ...EMPTY, ...data })
      } catch (error) {
        if (!cancelled) console.error('作品情報の取得に失敗しました', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [animeId])

  return { credits, loading }
}

export default useCredits
