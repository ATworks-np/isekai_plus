import React from 'react'
import { useAtom } from 'jotai'
import { loginModalAtom } from '@/store/loginModalState'
import { userAtom } from '@/store/userStore'
import { Box, Modal } from '@mui/material'
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
  const provider = new GoogleAuthProvider()

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
            alert('保存に失敗しました');
          }
        }
        setOpen(false)
      })
      .catch(error => {})
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <Box sx={style}>
        <GoogleButton onClick={handleLogin} />
      </Box>
    </Modal>
  )
}

export default LoginModal
