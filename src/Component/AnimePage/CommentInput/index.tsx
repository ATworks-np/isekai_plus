import React, { useState } from "react";
import {Box, TextField, Button, Stack, Avatar} from "@mui/material";
import useUser from "@/hooks/useUser";
import {addDoc, collection, doc} from "firebase/firestore";
import {db, storage} from "@/firebase";
import {ref, uploadBytes} from "firebase/storage";
import {useAtom} from "jotai/index";
import {customSnackbarAtom} from "@/store/customSnackbarState";
import useAnimeComments from "@/hooks/useAnimeComments";
import {userAtom} from "@/store/userStore";

const CommentInput: React.FC<{ id: string }> = (props) => {
  const [comment, setComment] = useState("");
  const [user, setUser] = useAtom(userAtom);
  const [message, setMessage] = useAtom<string>(customSnackbarAtom);
  const {animeComments, refreshAnimeComments} = useAnimeComments({ id: props.id });

  const handleSend = async() =>  {
    if(!user.isAuthenticated()) return
    try {
      const docRef  = await addDoc(collection(db, `versions/1/animes/${props.id}/comments`), {
        comment: comment,
        uid: user.props.uid,
        user: doc(db, `versions/1/users/${user.props.uid}`),
        userDisplayName: user.props.displayName,
        userPhotoURL: user.props.photoURL,
        createdAt: new Date(),
      });
      refreshAnimeComments();
      setComment("");
      setMessage(`コメントが追加されました`);
    } catch (error) {
      console.error('Firestore への保存に失敗しました', error);
      setMessage('コメント送信に失敗しました');
    }
  };

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: "100%",
        backgroundColor: "white",
        boxShadow: "0 -2px 5px rgba(0,0,0,0.1)",
        padding: 1,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center" maxWidth={800} width={'100%'}>
        {/* 入力欄 */}
        <Avatar alt={''} src={user.props.photoURL ?? ''} sx={{ width: 28, height: 28 }} />
        <TextField
          disabled={!user.isAuthenticated()}
          fullWidth
          multiline
          variant="outlined"
          placeholder={!user.isAuthenticated() ? "コメントを投稿するにはログインしてください" : "コメントを入力してください..."}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          autoComplete="off"
          sx={{
            "& .MuiInputBase-root":{
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
            },
          }}
        />
        {/* 送信ボタン */}
        <Button
          variant="contained"
          color="primary"
          onClick={ handleSend}
          disabled={!user.isAuthenticated() || !comment.trim()} // 空欄時はボタンを無効化
        >
          送信
        </Button>
      </Stack>
    </Box>
  );
};

export default CommentInput;