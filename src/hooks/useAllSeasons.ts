'use client'

import { useEffect, useState } from 'react'
import { Season } from '@/hooks/useSeasons'

/**
 * Every anime's seasons in one request, keyed by anime id.
 *
 * The list needs them to show the season a filtered cour actually refers to,
 * and fetching per card would be one request per row.
 */
const useAllSeasons = () => {
  const [seasonsByAnime, setSeasonsByAnime] = useState<Record<string, Season[]>>({})

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch('/api/v1/seasons/')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (!cancelled) setSeasonsByAnime(data.seasons ?? {})
      } catch (error) {
        if (!cancelled) console.error('シーズン一覧の取得に失敗しました', error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return seasonsByAnime
}

/**
 * The season a row should show: the one airing in a selected cour when the list
 * is filtered, otherwise the most recent. Without this a work that ran for four
 * seasons would show its first season's key visual under a 2026 filter.
 */
export const seasonForDisplay = (seasons: Season[] | undefined, selectedCours: string[]) => {
  if (!seasons?.length) return undefined
  if (selectedCours.length) {
    const airing = seasons.find(season => season.cours.some(cour => selectedCours.includes(cour)))
    if (airing) return airing
  }
  return seasons[seasons.length - 1]
}

export default useAllSeasons
