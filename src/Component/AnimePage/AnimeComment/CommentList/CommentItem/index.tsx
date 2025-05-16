import React from "react";
import { Avatar, Box, Typography, Stack } from "@mui/material";

interface CommentProps {
  avatarUrl: string;
  name: string;
  comment: string;
  date: string;
}


const CommentItem: React.FC<CommentProps> = ({ avatarUrl, name, comment, date }) => {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ marginBottom: 2 }}>
      {/* 左側のアバター */}
      <Avatar alt={name} src={avatarUrl} sx={{ width: 28, height: 28 }} />

      {/* 右側の情報 */}
      <Box>
        {/* 名前 */}
        <Typography variant="subtitle1" fontWeight="bold">
          {name}
        </Typography>
        {/* コメント */}
        <Typography variant="body2" sx={{ marginY: 0.5, lineHeight: 1.1,textAlign: "justify" }}>
          {comment}
        </Typography>
        {/* 日付 */}
        <Typography variant="caption" color="textSecondary">
          {date}
        </Typography>
      </Box>
    </Stack>
  );
};

export default CommentItem;