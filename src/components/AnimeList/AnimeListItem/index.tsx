import React, { useState, useEffect } from 'react'
import { Box, Snackbar, Alert } from '@mui/material'
import { styled } from '@mui/material'
import { Avatar } from '@mui/material'
import { Typography } from '@mui/material'

import IconButton from '@mui/material/IconButton'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import FavoriteIcon from '@mui/icons-material/Favorite'
import ForumIcon from '@mui/icons-material/Forum';
import { useAtom } from "jotai";
import StarRating from "@/components/StarRating";
import Link from "next/link";
import {tagsAtom} from "@/stores/tagStore";
import EditIcon from "@mui/icons-material/Edit";
import {userAtom} from "@/stores/userStore";
import { getAuth } from 'firebase/auth';
import { getThumbnailURL } from "@/utils/url"
import { Season } from "@/hooks/useSeasons"

const MyBox = styled(Box)(({ theme }) => ({
  borderRadius: '20px',
  padding: '5px 10px',
  width: '100%',
}))

const Thumbnail = styled(Avatar)(({ theme }) => ({
  borderRadius: '10px',
}))

const SumaryBox = styled(Box)(({ theme }) => ({
  marginLeft: '15px',
  width: '100%',
  flexDirection: 'column',
  justifyContent: 'space-between',
  display: 'flex',
}))

interface AnimeListItemProps {
  id: string;
  name: {
    ja: string
    en?: string
  };
  tags: string[];
  cours: string[];
  commentCount: number;
  likeCount?: number;
  rating: number;
  season?: Season;
  seasonCount?: number;
}

const AnimeListItem: React.FC<AnimeListItemProps> = props => {
  const [tags, setTags] = useAtom(tagsAtom)
  const [user, setUser] = useAtom(userAtom)
  // The count arrives with the row; only this user's own state has to be asked
  // for, and only once they are signed in.
  const [likeDelta, setLikeDelta] = useState(0)
  const likeCount = Math.max(0, (props.likeCount ?? 0) + likeDelta)
  const [likedByUser, setLikedByUser] = useState(false)
  // Signing out makes this false without an effect having to reset it.
  const userLiked = Boolean(user.props.uid) && likedByUser
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')

  useEffect(() => {
    if (!user.props.uid) return
    let cancelled = false

    const load = async () => {
      try {
        const currentUser = getAuth().currentUser
        if (!currentUser) return
        const token = await currentUser.getIdToken()
        const response = await fetch(`/api/v1/animes/${props.id}/likes/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (!cancelled) setLikedByUser(Boolean(data.liked))
      } catch (error) {
        if (!cancelled) console.error('いいねの取得に失敗しました', error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [props.id, user.props.uid])

  // Handle Snackbar close
  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  /**
   * Through the API so likeCount stays on the work: the list orders by it, and
   * Firestore cannot order by the size of a subcollection.
   */
  const handleLikeToggle = async () => {
    const currentUser = getAuth().currentUser
    if (!currentUser) {
      setSnackbarMessage('いいねするにはログインしてください')
      setSnackbarOpen(true)
      return
    }

    const next = !userLiked
    // Optimistic: the count is the row's plus this user's own change.
    setLikedByUser(next)
    setLikeDelta(delta => delta + (next ? 1 : -1))

    try {
      const token = await currentUser.getIdToken()
      const response = await fetch(`/api/v1/animes/${props.id}/likes/`, {
        method: next ? 'PUT' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      console.error('いいねの更新に失敗しました', error)
      setLikedByUser(!next)
      setLikeDelta(delta => delta - (next ? 1 : -1))
      setSnackbarMessage('いいねの更新に失敗しました')
      setSnackbarOpen(true)
    }
  }

  return (
    <MyBox display="flex">
      <Box sx={{ position: 'relative', flexShrink: 0, width: 80, height: 80 }}>
        <Thumbnail
          src={props.season?.thumbnailUrl ?? getThumbnailURL(props.id)}
          alt={props.name.ja}
          imgProps={{
            loading: 'lazy',
            decoding: 'async',
          }}
          sx={{ width: 80, height: 80 }}
        />
        {(props.seasonCount ?? 0) > 1 && props.season && (
          <Box
            sx={{
              position: 'absolute',
              right: 2,
              bottom: 2,
              px: 0.5,
              borderRadius: '4px',
              // Sits on artwork of any brightness, so it carries its own ground.
              backgroundColor: 'rgba(0,0,0,0.65)',
              color: 'white',
              fontSize: 10,
              lineHeight: '14px',
              whiteSpace: 'nowrap',
            }}
          >
            {props.season.label}
          </Box>
        )}
      </Box>
      <SumaryBox>
        <Link href={`/animes/${props.id}`}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 'bold',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 1,
            }}
          >
            {props.name['ja']}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={0}>
            {Object.keys(props.tags).length > 0 && props.tags.map((tag, index) => (
              <Typography sx={{lineHeight: 1.2, fontSize: 10}} key={index} variant="caption" color="primary">
                {tags[tag]?.name.ja}&nbsp;
              </Typography>
            ))}
          </Box>
        </Link>
        <Box display="flex" justifyContent="flex-start">
          <IconButton 
            aria-label="like" 
            sx={{padding: '5px'}}
            onClick={handleLikeToggle}
          >
            {userLiked ? (
              <FavoriteIcon sx={{fontSize: 14, marginRight: '3px', color: '#ff6b81'}}/>
            ) : (
              <FavoriteBorderIcon sx={{fontSize: 14, marginRight: '3px'}}/>
            )}
            <Typography sx={{lineHeight: 1.2, fontSize: 10}} variant="caption" color={userLiked ? '#ff6b81' : '#aaa'}>
              {likeCount}
            </Typography>
          </IconButton>
          <IconButton aria-label="comment" sx={{padding: '5px'}}>
            <ForumIcon sx={{fontSize: 14, marginRight: '3px'}}/>
            <Typography sx={{lineHeight: 1.2, fontSize: 10}} variant="caption" color={'#aaa'}>
              {props.commentCount ?? 0}
            </Typography>
          </IconButton>
          <StarRating rating={props.rating} sx={{fontSize: 14}}/>
          {user.isAdmin() && <Link href={`/admin/anime/edit/${props.id}`} passHref>
            <IconButton aria-label="edit" sx={{padding: '5px'}}>
              <EditIcon sx={{fontSize: 14, marginRight: '3px'}}/>
            </IconButton>
          </Link>}
        </Box>
      </SumaryBox>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity="info" sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </MyBox>
)
}

export default AnimeListItem
