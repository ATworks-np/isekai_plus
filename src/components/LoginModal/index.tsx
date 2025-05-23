import React, { useState } from 'react'
import { useAtom } from 'jotai'
import { loginModalAtom } from '@/store/loginModalState'
import { userAtom } from '@/store/userStore'
import { Box, Modal, Snackbar, Alert } from '@mui/material'
import theme from '@/theme/theme'
import GoogleButton from 'react-google-button'
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import User from '@/models/entities/user'
import {getDoc, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from "@/firebase";

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

const LoginModal: React.FC = props => {
  const [open, setOpen] = useAtom<boolean>(loginModalAtom)
  const [user, setUser] = useAtom(userAtom)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const provider = new GoogleAuthProvider()

  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  const handleLogin = async () => {
    const auth = getAuth()
    signInWithPopup(auth, provider)
      .then(async(result) => {
        const credential = GoogleAuthProvider.credentialFromResult(result)
        const token = credential?.accessToken || ''
        const userImpl = result.user

        const userDocRef = doc(db, "versions/1/users", userImpl.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data()
          setUser(
            new User({
              uid: userDoc.id,
              token: token,
              displayName: data.displayName,
              photoURL: userImpl.photoURL,
              type: data.type,
            })
          )
        }else{
          try {
            const data = {
              displayName: userImpl.displayName,
              photoURL: userImpl.photoURL,
              type: 'standard',
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            }
            await setDoc(userDocRef, data);

            setUser(
              new User({
                uid: userDoc.id,
                token: token,
                displayName: userImpl.displayName,
                photoURL: userImpl.photoURL,
                type: 'standard'
              })
            )
          } catch (error) {
            console.error('Firestore への保存に失敗しました', error);
            setSnackbarMessage('保存に失敗しました');
            setSnackbarOpen(true);
          }
        }
        setOpen(false)
      })
      .catch(error => {})
  }

  return (
    <>
      <Modal open={open} onClose={() => setOpen(false)}>
        <Box sx={style}>
          <GoogleButton onClick={handleLogin} />
        </Box>
      </Modal>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity="error" sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  )
}

export default LoginModal
