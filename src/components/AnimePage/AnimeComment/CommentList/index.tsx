import React from "react";
import { Avatar, Box, Typography, Stack } from "@mui/material";
import CommentItem from "@/components/AnimePage/AnimeComment/CommentList/CommentItem";
import Comment from "@/models/entities/comment";

interface CommentListProps {
  comments: Comment[];
  animeId: string;
  seasonLabels?: Record<string, string>;
}

const CommentList: React.FC<CommentListProps> = (props) => {
  return (
    <Box sx={{ padding: 2 }}>
      {props.comments.map((comment, index) => (
        <CommentItem
          key={index}
          avatarUrl={comment.props.avatarUrl}
          name={comment.props.name}
          comment={comment.props.comment}
          date={comment.props.date}
          uid={comment.props.uid}
          docId={comment.props.docId}
          animeId={props.animeId}
          seasonLabel={
            comment.props.seasonId ? props.seasonLabels?.[comment.props.seasonId] : undefined
          }
        />
      ))}
      {props.comments.length === 0 && (
        <Typography variant='caption'>
          コメントはまだありません
        </Typography>
      )
      }
    </Box>
  );
};

export default CommentList;
