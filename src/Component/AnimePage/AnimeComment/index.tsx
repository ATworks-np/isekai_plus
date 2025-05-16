import React, {useEffect} from "react";
import CommentList from "@/Component/AnimePage/AnimeComment/CommentList";
import Comment from "@/models/entities/comment";
import {collection, getDocs} from "firebase/firestore";
import {db} from "@/firebase";
import {date2YYYYMMDD} from "@/utils/date";
import {Stack, Typography} from "@mui/material";
import useAnimeComments from "@/hooks/useAnimeComments";

interface AnimeCommentProps {
  id: string;
}


const AnimeComment: React.FC<AnimeCommentProps> = (props) => {
  const [comments, setComments] = React.useState<Comment[] | undefined>(undefined);
  const {animeComments, refreshAnimeComments} = useAnimeComments({ id: props.id });

  useEffect(() => {
    const collectionRef = collection(db, `versions/1/animes/${props.id}/comments`)
    getDocs(collectionRef).then((querySnapshot: any) => {
      const buffer: any[] = []
      querySnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        buffer.push(new Comment(
          {
            comment: data.comment,
            date: date2YYYYMMDD(data.createdAt.toDate()),
            name: data.userDisplayName,
            avatarUrl: data.userPhotoURL,
          }
        ));
      })
      setComments(buffer);

    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Stack width={'100%'} maxWidth={600}>
      <Typography variant='caption' sx={{ marginX: 2 }}>
        コメント
      </Typography>
      {animeComments && <CommentList comments={animeComments} />}
    </Stack>

  );
};

export default AnimeComment;