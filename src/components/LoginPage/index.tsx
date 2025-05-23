'use client'

import useUser from '@/hooks/useUser'

import React, {ReactNode, useEffect} from 'react'
import { useRouter } from 'next/navigation'
import {getAuth, GoogleAuthProvider, signInWithPopup, signOut} from "firebase/auth";
import { useAtom } from "jotai";
import { userAtom } from "@/store/userStore";
import {doc, getDoc, serverTimestamp, setDoc} from "firebase/firestore";
import {db} from "@/firebase";
import User from "@/models/entities/user";
import {Box} from "@mui/material";
import GoogleButton from "react-google-button";
import {loadingModalAtom} from "@/store/loadingModalState";
import {customSnackbarAtom} from "@/store/customSnackbarState";

const style = {
  marginTop: '400px',
  display: 'flex',
  justifyContent: 'center',
}

const LoginPage: React.FC = props => {
  const [user, setUser] = useAtom(userAtom)
  const provider = new GoogleAuthProvider()
  const router = useRouter()
  const [open, setOpen] = useAtom(loadingModalAtom)
  const [message, setMessage] = useAtom<string>(customSnackbarAtom);

  const handleLogin = async () => {
    setOpen(true)
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
          setOpen(false);
          setMessage("おかえりなさい！いせかいぷらすを楽しんでくださいね。");
          router.push('/');
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
            setOpen(false);
            setMessage("ようこそ。いせかいぷらすへ！");
            router.push('/user');
          } catch (error) {
            setOpen(false);
            console.error('Firestore への保存に失敗しました', error);
            setMessage('保存に失敗しました');
            router.push('/');
          }
        }
      })
      .catch(error => {})
  }

  return  (
    <Box sx={style}>
      <GoogleButton onClick={handleLogin} />
    </Box>
  );
}

export default LoginPage
