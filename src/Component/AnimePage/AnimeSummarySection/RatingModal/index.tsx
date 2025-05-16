import React, {useEffect, useState} from 'react'
import { useAtom } from 'jotai'
import { loginModalAtom } from '@/store/loginModalState'
import {Box, Button, Container, Modal, Stack, Typography} from '@mui/material'
import theme from '@/theme/theme'
import GoogleButton from 'react-google-button'
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import User from '@/models/entities/user'
import {updateDoc, doc, setDoc, writeBatch, serverTimestamp, collection} from 'firebase/firestore'
import { db } from "@/firebase";
import EditStarRatingsSection from "@/Component/AnimePage/AnimeSummarySection/EditStarRatingsSection";
import user from "@/models/entities/user";
import useUser from "@/hooks/useUser";
import {IRatings, ratingLabels} from "@/models/interfaces/ratings"
import useAnimeMyRatings from "@/hooks/useAnimeMyRatings";
import {customSnackbarAtom} from "@/store/customSnackbarState";
import {userAtom} from "@/store/userStore";

interface RatingModalProps {
  open: boolean
  setOpen: (open: boolean) => void
  id: string
}

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '100%',
  bgcolor: theme.palette.background.default,
  p: 2,
  maxWidth: '800px',
}

const RatingModal: React.FC<RatingModalProps> = ({open, setOpen, id}) => {
  const [user, setUser] = useAtom(userAtom);
  const myRatings = useAnimeMyRatings({id: id, token: user?.props.token});
  const [ratings, setRatings] = useState(myRatings);
  const [message, setMessage] = useAtom<string>(customSnackbarAtom);

  useEffect(()=>{
    setRatings(myRatings);
  },[myRatings]);

  const handleSubmit = async() => {
    const batch = writeBatch(db); // バッチを作成

    try {
      Object.keys(ratingLabels).forEach((key) => {
        const ref = doc(db, `versions/1/animes/${id}/ratings/${key}/userRatings/${user.props.uid}`); // ドキュメントの参照を取得
        batch.set(ref, {
          value: ratings[key as keyof IRatings],
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit(); // バッチ処理をコミット
      setMessage("送信しました");
      setOpen(false);
    } catch (error) {
      setMessage("送信に失敗しました");
    }
  }

  return (
    <Modal open={user.isAuthenticated() && open} onClose={() => setOpen(false)}>
      <Container sx={style}>
        <Stack alignItems="center" spacing={1}>
          <Typography>
            星を付ける
          </Typography>
          <EditStarRatingsSection ratings={ratings} ratingLabels={ratingLabels} setRating={(key, rate)=>setRatings({...ratings, [key]:rate})}/>
          <Button
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: 2 }}
          >
            送信
          </Button>
        </Stack>
      </Container>
    </Modal>
  )
}

export default RatingModal
