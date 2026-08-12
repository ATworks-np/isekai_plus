'use client'

import { useCallback, useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { IRatings, baseRatings } from '@/models/interfaces/ratings'

/**
 * One request per season instead of the five the old flat layout needed, since
 * a user's five axes now live in a single document.
 */
const useSeasonMyRatings = (animeId: string | undefined, seasonId: string | undefined) => {
  const [myRatings, setMyRatings] = useState<IRatings>(baseRatings)

  const load = useCallback(async () => {
    if (!animeId || !seasonId) return

    const currentUser = getAuth().currentUser
    if (!currentUser) {
      setMyRatings(baseRatings)
      return
    }

    try {
      const token = await currentUser.getIdToken()
      const response = await fetch(`/api/v1/animes/${animeId}/seasons/${seasonId}/ratings/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setMyRatings({ ...baseRatings, ...(data.ratings ?? {}) })
    } catch (error) {
      console.error('自分の評価の取得に失敗しました', error)
      setMyRatings(baseRatings)
    }
  }, [animeId, seasonId])

  useEffect(() => {
    // The Firebase user is not restored yet on a hard reload, so wait for it
    // rather than deciding the visitor is signed out.
    const unsubscribe = getAuth().onAuthStateChanged(() => {
      load()
    })
    return () => unsubscribe()
  }, [load])

  return { myRatings, setMyRatings, reloadMyRatings: load }
}

export default useSeasonMyRatings
