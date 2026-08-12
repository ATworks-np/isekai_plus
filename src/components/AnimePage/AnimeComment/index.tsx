import React from "react";
import CommentList from "@/components/AnimePage/AnimeComment/CommentList";
import {Stack, Typography} from "@mui/material";
import useAnimeComments from "@/hooks/useAnimeComments";
import { Season } from "@/hooks/useSeasons";

interface AnimeCommentProps {
  id: string;
  seasons?: Season[];
}

const AnimeComment: React.FC<AnimeCommentProps> = (props) => {
  const {animeComments} = useAnimeComments({ id: props.id });
  const seasons = props.seasons ?? [];

  // Only worth labelling once a series actually has more than one season —
  // otherwise every comment would carry the same redundant chip.
  const seasonLabels = seasons.length > 1
    ? Object.fromEntries(seasons.map(season => [season.id, season.label]))
    : {};

  return (
    <Stack width={'100%'} maxWidth={600}>
      <Typography variant='caption' sx={{ marginX: 2 }}>
        コメント
      </Typography>
      {animeComments && (
        <CommentList comments={animeComments} animeId={props.id} seasonLabels={seasonLabels} />
      )}
    </Stack>

  );
};

export default AnimeComment;
