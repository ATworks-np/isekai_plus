'use client'

import React from 'react'
import { Stack } from '@mui/material'
import AnimeSummarySection from "@/components/AnimePage/AnimeSummarySection";
import CommentInput from "@/components/AnimePage/CommentInput";
import AnimeComment from "@/components/AnimePage/AnimeComment";
import useSeasons from "@/hooks/useSeasons";
import { IAnimeStatic } from "@/models/interfaces/animeStatic";

const AnimePage: React.FC<IAnimeStatic> = (props) => {
  // Seasons live here rather than in the summary section because the comment
  // box needs the same selection: a comment is recorded against the season the
  // reader is looking at.
  const { seasons, reloadSeasons } = useSeasons(props.id);
  const [selectedSeasonId, setSelectedSeasonId] = React.useState<string>('');

  const activeSeason =
    seasons.find(season => season.id === selectedSeasonId) ?? seasons[seasons.length - 1];

  if (!props.id) return null;

  return (
    <Stack id='stack' direction="column" alignItems="center">
      <AnimeSummarySection
        {...props}
        seasons={seasons}
        activeSeason={activeSeason}
        onSelectSeason={setSelectedSeasonId}
        onRatingSaved={reloadSeasons}
      />
      <AnimeComment id={props.id} seasons={seasons} />
      <CommentInput id={props.id} seasonId={activeSeason?.id} />
    </Stack>
  )
}

export default AnimePage
