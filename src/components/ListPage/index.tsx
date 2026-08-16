import React, { useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import AnimeList from '../AnimeList'
import SearchModal from '@/components/SearchModal'
import SelectCoursSection from '@/components/SelectCoursSection'
import NewsSection from '@/components/NewsSection'
import SeasonCarousel from '@/components/SeasonCarousel'
import { useTranslations } from 'next-intl'
import type { SortKey } from '@/hooks/useAnimeList'

const ListPage: React.FC = () => {
  const t = useTranslations('list')
  const [sort, setSort] = useState<SortKey>('rating')
  return (
    <Stack>
      {/* The page's own heading. Drawn off screen because the design opens with
          the logo and the carousel, but a page with no h1 tells a crawler
          nothing about what it lists. */}
      <Typography
        variant="h1"
        sx={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {t('heading')}
      </Typography>
      <SeasonCarousel />
      <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <NewsSection />
      </Box>
      <SearchModal />
      <Box
        component="nav"
        aria-label={`${t('currentCour')}・${t('sortLabel')}`}
        sx={{
          position: 'sticky',
          top: { xs: '56px', sm: '64px' },
          '@media (orientation: landscape) and (max-width: 599.95px)': {
            top: '48px',
          },
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
        sx={{
          width: '100%',
          maxWidth: '800px',
          mx: 'auto',
          pt: { xs: 2, sm: 3 },
        }}
      >
        <AnimeList sort={sort} />
      </Stack>
    </Stack>
  )
}

export default ListPage
