import React, { useState, useEffect } from "react";
import { Avatar, Box, Typography, Stack, Button, TextField, IconButton } from "@mui/material";
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAtom } from "jotai";
import { userAtom } from "@/store/userStore";
import { customSnackbarAtom } from "@/store/customSnackbarState";
import useAnimeComments from "@/hooks/useAnimeComments";

interface CommentProps {
  avatarUrl: string;
  name: string;
  comment: string;
  date: string;
  uid?: string;
  docId?: string;
  animeId: string;
}

const CommentItem: React.FC<CommentProps> = ({ avatarUrl, name, comment, date, uid, docId, animeId }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedComment, setEditedComment] = useState(comment);
  const [user] = useAtom(userAtom);
  const [message, setMessage] = useAtom<string>(customSnackbarAtom);
  const { refreshAnimeComments } = useAnimeComments({ id: animeId });

  const isOwnComment = user.props.uid === uid;

  // Update editedComment when comment prop changes
  useEffect(() => {
    setEditedComment(comment);
  }, [comment]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedComment(comment);
  };

  const handleSave = async () => {
    if (!docId) return;

    try {
      const commentRef = doc(db, `versions/1/animes/${animeId}/comments/${docId}`);
      await updateDoc(commentRef, {
        comment: editedComment,
      });

      setIsEditing(false);
      refreshAnimeComments();
      setMessage("コメントが更新されました");
    } catch (error) {
      console.error('コメントの更新に失敗しました', error);
      setMessage('コメントの更新に失敗しました');
    }
  };

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ marginBottom: 2 }}>
      {/* 左側のアバター */}
      <Avatar alt={name} src={avatarUrl} sx={{ width: 28, height: 28 }} />

      {/* 右側の情報 */}
      <Box sx={{ flexGrow: 1 }}>
        {/* 名前 */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" fontWeight="bold">
            {name}
          </Typography>
          {isOwnComment && !isEditing && (
            <IconButton size="small" onClick={handleEdit}>
              <EditIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>

        {/* コメント */}
        {isEditing ? (
          <Box sx={{ my: 1 }}>
            <TextField
              fullWidth
              multiline
              value={editedComment}
              onChange={(e) => setEditedComment(e.target.value)}
              size="small"
              sx={{ 
                mb: 1,
                "& .MuiInputBase-root": {
                  padding: {
                    xs: "5px",
                    sm: "10px",
                  },
                },
                "& .MuiInputBase-input": {
                  fontSize: {
                    xs: "12px", // スマホサイズ
                    sm: "14px", // タブレットサイズ
                    md: "16px", // デスクトップサイズ
                  },
                  lineHeight: 1.5,
                },
              }}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button 
                variant="contained" 
                size="small" 
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={!editedComment.trim()}
              >
                保存
              </Button>
              <Button 
                variant="outlined" 
                size="small" 
                startIcon={<CancelIcon />}
                onClick={handleCancel}
              >
                キャンセル
              </Button>
            </Stack>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ marginY: 0.5, lineHeight: 1.5, textAlign: "justify" }}>
            {comment}
          </Typography>
        )}

        {/* 日付 */}
        <Typography variant="caption" color="textSecondary">
          {date}
        </Typography>
      </Box>
    </Stack>
  );
};

export default CommentItem;
