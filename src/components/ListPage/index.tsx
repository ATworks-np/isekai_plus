import React from 'react'
import { Box, Stack, Typography } from '@mui/material'
import AnimeList from '../AnimeList'
import SearchModal from '@/components/SearchModal'
import SelectCoursSection from '@/components/SelectCoursSection'
import NewsSection from '@/components/NewsSection'
import SeasonCarousel from '@/components/SeasonCarousel'
import { useTranslations } from 'next-intl'

const ListPage: React.FC = () => {
  const t = useTranslations('list')
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
      <Stack spacing={2} sx={{ width: '100%', maxWidth: '800px' }}>
        <SearchModal />
        <SelectCoursSection />
        <AnimeList />
      </Stack>
    </Stack>
  )
}

export default ListPage
