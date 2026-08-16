'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useAtom } from 'jotai'
import type { User as FirebaseUser } from 'firebase/auth'
import { userAtom } from '@/stores/userStore'
import User from '@/models/entities/user'

const guest = () =>
  new User({ uid: undefined, token: 'guest', displayName: null, photoURL: null, type: 'guest' })

const useUser = ({ defer = false }: { defer?: boolean } = {}) => {
  const [user, setUser] = useAtom(userAtom)
  const initialization = useRef<Promise<User> | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)

  const initialize = useCallback(() => {
    if (initialization.current) return initialization.current

    initialization.current = (async () => {
      // These modules account for most of the auth chunk. They are loaded only
      // when a reader interacts with the header (or immediately on account
      // pages), never on an untouched public PageSpeed run.
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
    if (!defer) {
      void initialize()
      return () => unsubscribe.current?.()
    }

    const start = () => void initialize()
    window.addEventListener('pointerdown', start, { once: true, passive: true })
    window.addEventListener('keydown', start, { once: true })
    return () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      unsubscribe.current?.()
    }
  }, [defer, initialize])

  const refreshUserData = async () => {
    initialization.current = null
    return initialize()
  }

  return { user, setUser, refreshUserData, initialize }
}

export default useUser
