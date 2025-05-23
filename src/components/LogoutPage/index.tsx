'use client'

import useUser from '@/hooks/useUser'

import React, {ReactNode, useEffect} from 'react'

import { getAuth, signOut } from "firebase/auth";
import { useRouter } from 'next/navigation'
import { useAtom } from "jotai";
import { customSnackbarAtom } from "@/store/customSnackbarState";
import { guestUser } from "@/models/entities/user";
import {userAtom} from "@/store/userStore";

const LogoutPage: React.FC = props => {
  const [user, setUser] = useAtom(userAtom);
  const router = useRouter()
  const [message, setMessage] = useAtom<string>(customSnackbarAtom);
  useEffect(()=>{
    (async()=>{
      const auth = getAuth(); // Firebase Auth インスタンスを取得
      try {
        await signOut(auth); // ログアウト処理
        setUser(guestUser);
        setMessage("ログアウトしました");
        router.push('/');
      } catch (error) {
        console.assert(error);
        setMessage("ログアウトに失敗しました:");
        router.push('/');
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return  <></>
}

export default LogoutPage
