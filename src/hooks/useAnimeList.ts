'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Season } from '@/hooks/useSeasons'
import { IRatings } from '@/models/interfaces/ratings'

export const SORT_OPTIONS = [
  { key: 'recent', label: '放送が新しい順' },
  { key: 'likes', label: 'いいね順' },
  { key: 'comments', label: 'コメントが多い順' },
  { key: 'rating', label: '評価順' },
] as const

export type SortKey = (typeof SORT_OPTIONS)[number]['key']

export type AnimeListEntry = {
  id: string
  name: { ja: string; en: string }
  cours: string[]
  tags: string[]
  commentCount: number
  likeCount: number
  latestCour: string | null
  rating: number
  ratings: IRatings
  seasons: Season[]
  thumbnailUrl: string
}

/**
 * One page of the list at a time.
 *
 * Filtering and ordering happen server side: the page used to hold all 155
 * works and sort them in the browser, which cannot be done at all for "newest
 * broadcast" without reading every work's cours.
 */
const useAnimeList = (sort: SortKey, cour: string | null) => {
  const [items, setItems] = useState<AnimeListEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [done, setDone] = useState<boolean>(false)

  // A page that arrives after the sort changed belongs to the previous list.
  const requestRef = useRef(0)

  // Returns the page rather than storing it, so both the first load and
  // loadMore share one request path and neither sets state before an await.
  const fetchPage = useCallback(
    async (nextCursor: string | null) => {
      const params = new URLSearchParams({ sort })
      if (cour) params.set('cour', cour)
      if (nextCursor) params.set('cursor', nextCursor)

      const response = await fetch(`/api/v1/animes/?${params}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as { items?: AnimeListEntry[]; nextCursor?: string | null }
    },
    [sort, cour]
  )

  const apply = useCallback(
    (data: { items?: AnimeListEntry[]; nextCursor?: string | null }, append: boolean) => {
      setItems(prev => (append ? [...prev, ...(data.items ?? [])] : (data.items ?? [])))
      setCursor(data.nextCursor ?? null)
      setDone(!data.nextCursor)
      setLoading(false)
    },
    []
  )

  // Adjusted while rendering rather than in an effect: changing the sort throws
  // the current list away, and doing that afterwards paints one frame of the
  // old list under the new heading.
  const listKey = `${sort}|${cour ?? ''}`
  const [renderedKey, setRenderedKey] = useState(listKey)
  if (listKey !== renderedKey) {
    setRenderedKey(listKey)
    setItems([])
    setCursor(null)
    setDone(false)
    setLoading(true)
  }

  useEffect(() => {
    const requestId = ++requestRef.current
    const load = async () => {
      try {
        const data = await fetchPage(null)
        if (requestRef.current === requestId) apply(data, false)
      } catch (error) {
        if (requestRef.current === requestId) {
          console.error('作品一覧の取得に失敗しました', error)
          setLoading(false)
        }
      }
    }
    load()
  }, [fetchPage, apply])

  const loadMore = useCallback(async () => {
    if (loading || done || !cursor) return
    const requestId = requestRef.current
    setLoading(true)
    try {
      const data = await fetchPage(cursor)
      if (requestRef.current === requestId) apply(data, true)
    } catch (error) {
      if (requestRef.current === requestId) {
        console.error('作品一覧の取得に失敗しました', error)
        setLoading(false)
      }
    }
  }, [apply, cursor, done, fetchPage, loading])

  return { items, loading, done, loadMore }
}

export default useAnimeList
