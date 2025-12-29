'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import {useAtom} from "jotai";
import {userAtom} from "@/stores/userStore";

interface Props {
  children: ReactNode
}

const AdminGuard: React.FC<Props> = ({ children }) => {
  const [user, setUser] = useAtom(userAtom);
  const router = useRouter()

  useEffect(() => {
    if(!user.props.type) return ;
    if (user && user.props.type !== 'admin') {
      router.push('/')
    }
  }, [user, router])

  if (!user || user.props.type !== 'admin') {
    return <></>
  }

  return <>{children}</>
}

export default AdminGuard
