'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material'
import CircularProgress from '@mui/material/CircularProgress'
import { useAtom } from 'jotai'
import ContentListItem from './AnimeListItem'
import AnimeListItemSkeleton from './AnimeListItemSkeleton'
import { searchSelectedTagAtom } from '@/stores/searchSelectedTagAtom'
import { courAtom } from '@/stores/coursState'
import { seasonForDisplay } from '@/hooks/useAllSeasons'
import useAnimeList, { SORT_OPTIONS, SortKey } from '@/hooks/useAnimeList'
import useTags from '@/hooks/useTags'

const AnimeList: React.FC = props => {
  const [tagsState] = useAtom<string[]>(searchSelectedTagAtom)
  const [coursState] = useAtom<string[]>(courAtom)
  const [sort, setSort] = useState<SortKey>('recent')
  useTags()

  // The picker selects one cour, which is what the server filters by, so
  // nothing is left to narrow here.
  const [selectedCour] = coursState
  const { items, loading, done, loadMore } = useAnimeList(sort, selectedCour ?? null)

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
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 1 }}>
        <TextField
          select
          size="small"
          value={sort}
          onChange={event => setSort(event.target.value as SortKey)}
          sx={{ minWidth: 180, backgroundColor: '#FFF', borderRadius: 1 }}
        >
          {SORT_OPTIONS.map(option => (
            <MenuItem key={option.key} value={option.key}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

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
            該当する作品がありません
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
