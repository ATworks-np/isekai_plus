'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import { Box, Stack } from '@mui/material'
import AnimeList from '@/components/AnimeList'
import SelectCoursSection from '@/components/SelectCoursSection'
import type { AnimeListPage, SortKey } from '@/models/animeList'
import { useTranslations } from 'next-intl'
import { useHydrateAtoms } from 'jotai/utils'
import { tagsAtom } from '@/stores/tagStore'
import type { TagCatalogue } from '@/models/tagCatalogue'

const SearchModal = dynamic(() => import('@/components/SearchModal'), { ssr: false })

type AnimeListControlsProps = {
  initialAnimePage?: AnimeListPage
  initialTags: TagCatalogue
}

const AnimeListControls: React.FC<AnimeListControlsProps> = ({
  initialAnimePage,
  initialTags,
}) => {
  useHydrateAtoms([[tagsAtom, initialTags]])
  const t = useTranslations('list')
  const [sort, setSort] = useState<SortKey>('rating')

  return (
    <>
      <SearchModal />
      <Box
        component="nav"
        aria-label={`${t('currentCour')}・${t('sortLabel')}`}
        sx={{
          position: 'sticky',
          top: { xs: '56px', sm: '64px' },
          '@media (orientation: landscape) and (max-width: 599.95px)': { top: '48px' },
          zIndex: theme => theme.zIndex.appBar - 1,
          width: '100%',
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: 'rgba(246, 248, 249, 0.94)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 3px 10px rgba(25, 50, 56, 0.08)',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: '1200px',
            mx: 'auto',
            px: 'clamp(8px, 3vw, 32px)',
            py: 0.75,
          }}
        >
          <SelectCoursSection sort={sort} onSortChange={setSort} />
        </Box>
      </Box>
      <Stack
        spacing={2}
        sx={{ width: '100%', maxWidth: '800px', mx: 'auto', pt: { xs: 2, sm: 3 } }}
      >
        <AnimeList sort={sort} initialPage={initialAnimePage} tagCatalogue={initialTags} />
      </Stack>
    </>
  )
}

export default AnimeListControls
