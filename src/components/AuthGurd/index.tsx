'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useUser from '@/hooks/useUser'
import type { ReactNode } from 'react'
import {userAtom} from "@/stores/userStore";
import {useAtom} from "jotai";

interface Props {
  children: ReactNode
}

const AuthGurd: React.FC<Props> = ({ children }) => {
  const [user,  setUser] = useAtom(userAtom);
  const router = useRouter()

  useEffect(() => {
    if(user.props.type === undefined) return;
    if (!user.isAuthenticated()) {
      router.push('/login')
    }
  }, [user, router])

  if (!user.isAuthenticated()) {
    return null
  }

  return <>{children}</>
}

export default AuthGurd
