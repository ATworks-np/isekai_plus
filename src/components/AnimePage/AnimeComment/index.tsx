import React from "react";
import CommentList from "@/components/AnimePage/AnimeComment/CommentList";
import {Stack, Typography} from "@mui/material";
import useAnimeComments from "@/hooks/useAnimeComments";

interface AnimeCommentProps {
  id: string;
}

const AnimeComment: React.FC<AnimeCommentProps> = (props) => {
  const {animeComments} = useAnimeComments({ id: props.id });

  return (
    <Stack width={'100%'} maxWidth={600}>
      <Typography variant='caption' sx={{ marginX: 2 }}>
        コメント
      </Typography>
      {animeComments && <CommentList comments={animeComments} animeId={props.id} />}
    </Stack>

  );
};

export default AnimeComment;
