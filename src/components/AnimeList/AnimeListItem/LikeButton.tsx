'use client'

import React, { useEffect, useState } from 'react'
import { IconButton, Typography } from '@mui/material'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import FavoriteIcon from '@mui/icons-material/Favorite'
import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { userAtom } from '@/stores/userStore'
import { customSnackbarAtom } from '@/stores/customSnackbarState'

const LikeButton: React.FC<{ animeId: string; initialCount: number }> = ({
  animeId,
  initialCount,
}) => {
  const t = useTranslations('list')
  const [user] = useAtom(userAtom)
  const [, setMessage] = useAtom(customSnackbarAtom)
  const [liked, setLiked] = useState(false)
  const [delta, setDelta] = useState(0)
  const count = Math.max(0, initialCount + delta)
  const userLiked = Boolean(user.props.uid) && liked

  useEffect(() => {
    if (!user.props.uid) return
    let cancelled = false

    const load = async () => {
      try {
        // Firebase Auth stays in an async chunk and is never downloaded for a
        // signed-out reader who only scrolls the public list.
        const { getAuth } = await import('firebase/auth')
        const currentUser = getAuth().currentUser
        if (!currentUser) return
        const response = await fetch(`/api/v1/animes/${animeId}/likes/`, {
          headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (!cancelled) setLiked(Boolean(data.liked))
      } catch (error) {
        if (!cancelled) console.error('いいねの取得に失敗しました', error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [animeId, user.props.uid])

  const toggle = async () => {
    const { getAuth } = await import('firebase/auth')
    const currentUser = getAuth().currentUser
    if (!currentUser) {
      setMessage(t('likeSignIn'))
      return
    }

    const next = !userLiked
    setLiked(next)
    setDelta(value => value + (next ? 1 : -1))

    try {
      const response = await fetch(`/api/v1/animes/${animeId}/likes/`, {
        method: next ? 'PUT' : 'DELETE',
        headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      console.error('いいねの更新に失敗しました', error)
      setLiked(!next)
      setDelta(value => value - (next ? 1 : -1))
      setMessage(t('likeFailed'))
    }
  }

  return (
    <IconButton
      aria-label={t('likeCount', { count })}
      sx={{ p: '5px' }}
      onClick={toggle}
    >
      {userLiked ? (
        <FavoriteIcon sx={{ fontSize: 14, mr: '3px', color: '#d92f53' }} />
      ) : (
        <FavoriteBorderIcon sx={{ fontSize: 14, mr: '3px' }} />
      )}
      <Typography
        sx={{ lineHeight: 1.2, fontSize: 10 }}
        variant="caption"
        color={userLiked ? '#b51f42' : 'text.secondary'}
      >
        {count}
      </Typography>
    </IconButton>
  )
}

export default LikeButton
