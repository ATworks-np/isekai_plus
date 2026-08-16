import React, { useState } from "react";
import {Box, TextField, Button, Stack, Avatar} from "@mui/material";
import useUser from "@/hooks/useUser";
import {addDoc, collection, doc} from "firebase/firestore";
import {db, storage} from "@/firebase";
import {ref, uploadBytes} from "firebase/storage";
import {useAtom} from "jotai/index";
import {customSnackbarAtom} from "@/stores/customSnackbarState";
import useAnimeComments from "@/hooks/useAnimeComments";
import {userAtom} from "@/stores/userStore";
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'

const CommentInput: React.FC<{ id: string; seasonId?: string }> = (props) => {
  const t = useTranslations('comments')
  const locale = useLocale()
  const router = useRouter()
  const [comment, setComment] = useState("");
  const [user, setUser] = useAtom(userAtom);
  const [message, setMessage] = useAtom<string>(customSnackbarAtom);
  const {refreshAnimeComments} = useAnimeComments({ id: props.id });
  const signedIn = user.isAuthenticated();

  const handleSend = async() =>  {
    if(!user.isAuthenticated()) return
    try {
      const docRef  = await addDoc(collection(db, `versions/1/animes/${props.id}/comments`), {
        comment: comment,
        // Records which season the reader had open. Comments still all live on
        // the series, so this labels them rather than filing them away.
        seasonId: props.seasonId ?? null,
        uid: user.props.uid,
        user: doc(db, `versions/1/users/${user.props.uid}`),
        userDisplayName: user.props.displayName,
        userPhotoURL: user.props.photoURL,
        // What the reader wrote in. A comment is never translated — it is
        // someone's own words — so this is here to label it, and to let a page
        // in another language decide whether to show it.
        lang: locale,
        createdAt: new Date(),
      });
      refreshAnimeComments();
      setComment("");
      setMessage(t('added'));
    } catch (error) {
      console.error('Firestore への保存に失敗しました', error);
      setMessage(t('failed'));
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
        {/* 入力欄. Signed out it says why it is dead but cannot be clicked, so
            the wrapper carries the way in — the field itself ignores the
            pointer and lets the click through to it. */}
        <Avatar alt={''} src={user.props.photoURL ?? ''} sx={{ width: 28, height: 28 }} />
        <Box
          sx={{ flex: 1, cursor: signedIn ? 'auto' : 'pointer' }}
          onClick={signedIn ? undefined : () => router.push('/login')}
        >
          <TextField
            disabled={!signedIn}
            fullWidth
            multiline
            variant="outlined"
            placeholder={!signedIn ? t('signedOut') : t('placeholder')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            autoComplete="off"
            sx={{
              "& .MuiInputBase-root":{
                padding: {
                  xs: "5px",
                  sm: "10px",
                },
                pointerEvents: signedIn ? 'auto' : 'none',
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
        </Box>
        {/* 送信ボタン。Signed out there is nothing to send, so the same slot is
            the sign-in button rather than a permanently greyed-out 送信. */}
        {signedIn ? (
          <Button
            variant="contained"
            color="primary"
            onClick={ handleSend}
            disabled={!comment.trim()} // 空欄時はボタンを無効化
          >
            {t('send')}
          </Button>
        ) : (
          <Button variant="contained" color="primary" onClick={() => router.push('/login')}>
            {t('signIn')}
          </Button>
        )}
      </Stack>
    </Box>
  );
};

export default CommentInput;
