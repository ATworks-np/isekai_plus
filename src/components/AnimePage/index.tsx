'use client'

import React from 'react'
import { Stack } from '@mui/material'
import AnimeSummarySection from "@/components/AnimePage/AnimeSummarySection";
import CommentInput from "@/components/AnimePage/CommentInput";
import AnimeComment from "@/components/AnimePage/AnimeComment";
import AnimeDetailsSection from "@/components/AnimePage/AnimeDetailsSection";
import useSeasons from "@/hooks/useSeasons";
import { IAnimeStatic } from "@/models/interfaces/animeStatic";

const AnimePage: React.FC<IAnimeStatic> = (props) => {
  // Seasons live here rather than in the summary section because the comment
  // box needs the same selection: a comment is recorded against the season the
  // reader is looking at.
  const { seasons, loading: loadingSeasons, reloadSeasons } = useSeasons(props.id);
  const [selectedSeasonId, setSelectedSeasonId] = React.useState<string>('');

  const activeSeason =
    seasons.find(season => season.id === selectedSeasonId) ?? seasons[seasons.length - 1];

  if (!props.id) return null;

  return (
    // The comment box is fixed to the bottom of the viewport, so it sits over
    // whatever the page ends with — the last comment was unreadable behind it.
    // The padding is the box's own height at each breakpoint, which grows with
    // its font size, plus a little air.
    <Stack id='stack' direction="column" alignItems="center" sx={{ pb: { xs: '64px', sm: '72px', md: '76px' } }}>
      <AnimeSummarySection
        {...props}
        seasons={seasons}
        activeSeason={activeSeason}
        loadingSeasons={loadingSeasons}
        onSelectSeason={setSelectedSeasonId}
        onRatingSaved={reloadSeasons}
      />
      <AnimeDetailsSection id={props.id} />
      <AnimeComment id={props.id} seasons={seasons} />
      <CommentInput id={props.id} seasonId={activeSeason?.id} />
    </Stack>
  )
}

export default AnimePage
