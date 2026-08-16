'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useAtom } from 'jotai'
import type { User as FirebaseUser } from 'firebase/auth'
import { userAtom } from '@/stores/userStore'
import User from '@/models/entities/user'

const guest = () =>
  new User({ uid: undefined, token: 'guest', displayName: null, photoURL: null, type: 'guest' })

const useUser = () => {
  const [user, setUser] = useAtom(userAtom)
  const initialization = useRef<Promise<User> | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)

  const initialize = useCallback(() => {
    if (initialization.current) return initialization.current

    initialization.current = (async () => {
      // Keep Firebase out of the initial bundle, but load it immediately after
      // hydration so persisted authentication is restored without requiring a
      // click on the account icon.
      const [{ getAuth }, { doc, getDoc }, { db }] = await Promise.all([
        import('firebase/auth'),
        import('firebase/firestore'),
        import('@/firebase'),
      ])
      const auth = getAuth()
      await auth.authStateReady()

      const resolve = async (firebaseUser: FirebaseUser | null) => {
        if (!firebaseUser) {
          const value = guest()
          setUser(value)
          return value
        }

        const userDocRef = doc(db, 'versions/1/users', firebaseUser.uid)
        const [token, snapshot] = await Promise.all([
          firebaseUser.getIdToken(),
          getDoc(userDocRef),
        ])
        const data = snapshot.data()
        const value = new User({
          uid: firebaseUser.uid,
          token,
          photoURL: data?.photoURL ?? firebaseUser.photoURL,
          displayName: data?.displayName ?? firebaseUser.displayName,
          type: data?.type ?? 'standard',
        })
        setUser(value)
        return value
      }

      const value = await resolve(auth.currentUser)
      unsubscribe.current = auth.onAuthStateChanged(next => {
        void resolve(next)
      })
      return value
    })()

    return initialization.current
  }, [setUser])

  useEffect(() => {
    void initialize()
    return () => unsubscribe.current?.()
  }, [initialize])

  const refreshUserData = async () => {
    initialization.current = null
    return initialize()
  }

  return { user, setUser, refreshUserData, initialize }
}

export default useUser
