import { Box, Stack, Typography } from '@mui/material'
import NewsSection from '@/components/NewsSection'
import SeasonCarousel from '@/components/SeasonCarousel'
import AnimeListControls from '@/components/ListPage/AnimeListControls'
import { getTranslations } from 'next-intl/server'
import type { AnimeListEntry, AnimeListPage } from '@/models/animeList'
import type { LatestNews } from '@/lib/news'

type ListPageProps = {
  initialAnimePage?: AnimeListPage
  carouselItems: AnimeListEntry[]
  currentCour: string
  latestNews: LatestNews | null
}

const ListPage = async ({
  initialAnimePage,
  carouselItems,
  currentCour,
  latestNews,
}: ListPageProps) => {
  const t = await getTranslations('list')
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
      <SeasonCarousel initialItems={carouselItems} currentCour={currentCour} />
      <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <NewsSection latestNews={latestNews} />
      </Box>
      <AnimeListControls initialAnimePage={initialAnimePage} />
    </Stack>
  )
}

export default ListPage
