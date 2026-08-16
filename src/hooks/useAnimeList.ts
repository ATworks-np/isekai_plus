'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnimeListEntry, AnimeListPage, SortKey } from '@/models/animeList'

/**
 * One page of the list at a time.
 *
 * Filtering and ordering happen server side: the page used to hold all 155
 * works and sort them in the browser, which cannot be done at all for "newest
 * broadcast" without reading every work's cours.
 */
const useAnimeList = (
  sort: SortKey,
  cour: string | null,
  initialPage?: AnimeListPage
) => {
  const listKey = `${sort}|${cour ?? ''}`
  const initialKey = 'rating|'
  const startsWithInitialPage = Boolean(initialPage) && listKey === initialKey
  const [items, setItems] = useState<AnimeListEntry[]>(
    startsWithInitialPage ? initialPage!.items : []
  )
  const [cursor, setCursor] = useState<string | null>(
    startsWithInitialPage ? initialPage!.nextCursor : null
  )
  const [loading, setLoading] = useState<boolean>(!startsWithInitialPage)
  const [done, setDone] = useState<boolean>(
    startsWithInitialPage ? !initialPage!.nextCursor : false
  )

  // A page that arrives after the sort changed belongs to the previous list.
  const requestRef = useRef(0)
  const initialPageHandledRef = useRef(false)

  // Returns the page rather than storing it, so both the first load and
  // loadMore share one request path and neither sets state before an await.
  const fetchPage = useCallback(
    async (nextCursor: string | null) => {
      const params = new URLSearchParams({ sort })
      if (cour) params.set('cour', cour)
      if (nextCursor) params.set('cursor', nextCursor)

      const response = await fetch(`/api/v1/animes/?${params}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as AnimeListPage
    },
    [sort, cour]
  )

  const apply = useCallback(
    (data: AnimeListPage, append: boolean) => {
      setItems(prev => (append ? [...prev, ...data.items] : data.items))
      setCursor(data.nextCursor)
      setDone(!data.nextCursor)
      setLoading(false)
    },
    []
  )

  // Adjusted while rendering rather than in an effect: changing the sort throws
  // the current list away, and doing that afterwards paints one frame of the
  // old list under the new heading.
  const [renderedKey, setRenderedKey] = useState(listKey)
  if (listKey !== renderedKey) {
    setRenderedKey(listKey)
    setItems([])
    setCursor(null)
    setDone(false)
    setLoading(true)
  }

  useEffect(() => {
    // The server already produced this exact first page. Fetching it again
    // would replace the hydrated rows and waste the crawl-friendly response.
    if (!initialPageHandledRef.current) {
      initialPageHandledRef.current = true
      if (startsWithInitialPage) return
    }

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
  }, [fetchPage, apply, startsWithInitialPage])

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
