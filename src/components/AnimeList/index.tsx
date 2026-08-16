'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import CircularProgress from '@mui/material/CircularProgress'
import { useAtom } from 'jotai'
import ContentListItem from './AnimeListItem'
import AnimeListItemSkeleton from './AnimeListItemSkeleton'
import { searchSelectedTagAtom } from '@/stores/searchSelectedTagAtom'
import { courAtom } from '@/stores/coursState'
import { seasonForDisplay } from '@/hooks/useAllSeasons'
import useAnimeList from '@/hooks/useAnimeList'
import type { AnimeListPage, SortKey } from '@/models/animeList'
import useTags from '@/hooks/useTags'
import { useTranslations } from 'next-intl'

type AnimeListProps = {
  sort: SortKey
  initialPage?: AnimeListPage
}

const AnimeList: React.FC<AnimeListProps> = ({ sort, initialPage }) => {
  const t = useTranslations('list')
  const [tagsState] = useAtom<string[]>(searchSelectedTagAtom)
  const [coursState] = useAtom<string[]>(courAtom)
  useTags()

  // The picker selects one cour, which is what the server filters by, so
  // nothing is left to narrow here.
  const [selectedCour] = coursState
  const { items, loading, done, loadMore } = useAnimeList(
    sort,
    selectedCour ?? null,
    initialPage
  )

  const visible = useMemo(
    () => items.filter(anime => !tagsState.length || tagsState.every(key => anime.tags.includes(key))),
    [items, tagsState]
  )

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      // Start the next page before the reader reaches the end of this one.
      { rootMargin: '400px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div style={styles.container}>
      <Stack spacing={2}>
        {visible.map(anime => (
          <ContentListItem
            key={anime.id}
            {...anime}
            season={seasonForDisplay(anime.seasons, coursState)}
            seasonCount={anime.seasons?.length ?? 0}
          />
        ))}

        {/* First load draws the rows that are coming; a later page is a scroll
            past rows already on screen, where a spinner at the end is enough. */}
        {loading && items.length === 0 && (
          <>
            {Array.from({ length: 8 }, (_, index) => (
              <AnimeListItemSkeleton key={index} />
            ))}
          </>
        )}

        {loading && items.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress color="secondary" />
          </Box>
        )}

        {!loading && visible.length === 0 && (
          <Typography variant="body2" sx={{ px: 2, py: 4, textAlign: 'center' }}>
            {t('empty')}
          </Typography>
        )}

        {/* Watched by the observer above; loading more is a scroll, not a click. */}
        <div ref={sentinelRef} />
      </Stack>
    </div>
  )
}

export default AnimeList

const styles = {
  container: {
    width: '100%',
  },
}
