'use client'

import { useEffect } from 'react'
import { userAtom } from '@/store/userStore'
import { getAuth } from 'firebase/auth'
import { useAtom } from 'jotai'
import User from '@/models/entities/user'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/firebase'

const useUser = () => {
  const [user, setUser] = useAtom(userAtom)

  useEffect(() => {
    const auth = getAuth()
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken()
        const userDocRef = doc(db, 'versions/1/users', firebaseUser.uid)
        const docSnapshot = await getDoc(userDocRef)
        const userData = docSnapshot.data()
        setUser(
          new User({
            uid: userDocRef.id,
            token,
            photoURL: userData?.photoURL,
            displayName: userData?.displayName,
            type: userData?.type,
          })
        )
      } else {
        setUser(
          new User({
            uid: undefined,
            token: 'guest',
            displayName: null,
            photoURL: null,
            type: 'guest',
          })
        )
      }
    })

    return () => unsubscribe()
  }, [setUser]) // user を依存に入れない

  const refreshUserData = async () => {
    if (!user.props.uid) return
    const userDocRef = doc(db, 'versions/1/users', user.props.uid)
    const docSnapshot = await getDoc(userDocRef)
    const userData = docSnapshot.data()
    setUser(
      new User({
        uid: user.props.uid,
        token: user.props.token,
        photoURL: userData?.photoURL,
        displayName: userData?.displayName,
        type: userData?.type,
      })
    )
  }

  return { user, setUser, refreshUserData }
}

export default useUser
