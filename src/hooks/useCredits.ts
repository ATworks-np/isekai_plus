'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'

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

const isEmpty = (credits: Credits) =>
  !credits.studios.length &&
  !credits.staff.length &&
  !credits.cast.length &&
  !credits.themeSongs.length

/**
 * Fetched on mount rather than when the accordion opens: the panels have to
 * know whether there is anything to show before the reader clicks, and the
 * record is one small document.
 *
 * Credits are stored per language and no English one has been written yet, so
 * an empty answer falls back to Japanese. Without it the English page would
 * simply lose the whole section — names and studios a reader can use either
 * way — until every work has been translated.
 */
const useCredits = (animeId: string | undefined) => {
  const locale = useLocale()
  const [credits, setCredits] = useState<Credits>(EMPTY)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!animeId) return
    let cancelled = false

    const fetchFor = async (lang: string): Promise<Credits> => {
      const response = await fetch(`/api/v1/animes/${animeId}/credits/?lang=${lang}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return { ...EMPTY, ...((await response.json()) as Credits) }
    }

    const load = async () => {
      try {
        let data = await fetchFor(locale)
        if (locale !== 'ja' && isEmpty(data)) data = await fetchFor('ja')
        if (!cancelled) setCredits(data)
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
  }, [animeId, locale])

  return { credits, loading }
}

export default useCredits
