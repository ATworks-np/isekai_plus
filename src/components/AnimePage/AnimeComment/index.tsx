import React from "react";
import CommentList from "@/components/AnimePage/AnimeComment/CommentList";
import {Skeleton, Stack, Typography} from "@mui/material";
import useAnimeComments from "@/hooks/useAnimeComments";
import { Season } from "@/hooks/useSeasons";

interface AnimeCommentProps {
  id: string;
  seasons?: Season[];
}

const AnimeComment: React.FC<AnimeCommentProps> = (props) => {
  const {animeComments, loading} = useAnimeComments({ id: props.id });
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
      {/* Two comments' worth of skeleton: enough to hold the space, not so much
          that a work with none jumps upward when the answer arrives. */}
      {loading && (
        <Stack sx={{ p: 2 }} spacing={2}>
          {Array.from({ length: 2 }, (_, index) => (
            <Stack key={index} direction="row" spacing={1.5}>
              <Skeleton variant="circular" width={32} height={32} />
              <Stack sx={{ flex: 1 }}>
                <Skeleton variant="text" width="30%" sx={{ fontSize: '0.875rem' }} />
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="20%" sx={{ fontSize: '0.75rem' }} />
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}

      {!loading && animeComments && (
        <CommentList comments={animeComments} animeId={props.id} seasonLabels={seasonLabels} />
      )}
    </Stack>

  );
};

export default AnimeComment;
