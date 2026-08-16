'use client'

import React from 'react'
import { Stack } from '@mui/material'
import AnimeSummarySection from '@/components/AnimePage/AnimeSummarySection'
import CommentInput from '@/components/AnimePage/CommentInput'
import AnimeComment from '@/components/AnimePage/AnimeComment'
import useSeasons, { type Season } from '@/hooks/useSeasons'
import type { IAnimeStatic } from '@/models/interfaces/animeStatic'

type AnimePageInteractiveProps = IAnimeStatic & {
  initialSeasons: Season[]
  details: React.ReactNode
}

/** State shared by the season picker, ratings and comments. */
const AnimePageInteractive: React.FC<AnimePageInteractiveProps> = ({
  initialSeasons,
  details,
  ...anime
}) => {
  const { seasons, loading: loadingSeasons, reloadSeasons } = useSeasons(
    anime.id,
    initialSeasons
  )
  const [selectedSeasonId, setSelectedSeasonId] = React.useState('')

  const activeSeason =
    seasons.find(season => season.id === selectedSeasonId) ?? seasons[seasons.length - 1]

  if (!anime.id) return null

  return (
    <Stack
      id="stack"
      direction="column"
      alignItems="center"
      sx={{ pb: { xs: '64px', sm: '72px', md: '76px' } }}
    >
      <AnimeSummarySection
        {...anime}
        seasons={seasons}
        activeSeason={activeSeason}
        loadingSeasons={loadingSeasons}
        onSelectSeason={setSelectedSeasonId}
        onRatingSaved={reloadSeasons}
      />
      {details}
      <AnimeComment id={anime.id} seasons={seasons} />
      <CommentInput id={anime.id} seasonId={activeSeason?.id} />
    </Stack>
  )
}

export default AnimePageInteractive
