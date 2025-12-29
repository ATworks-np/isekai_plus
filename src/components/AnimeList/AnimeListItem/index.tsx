import React, { useState, useEffect } from 'react'
import { Box, Chip, Snackbar, Alert } from '@mui/material'
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
import { db } from '@/firebase';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';

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
    en: string
  };
  thumbnail: string;
  tags: string[];
  cours: string[];
  commentCount: number;
  rating: number;
}

const AnimeListItem: React.FC<AnimeListItemProps> = props => {
  const [tags, setTags] = useAtom(tagsAtom)
  const [user, setUser] = useAtom(userAtom)
  const [likeCount, setLikeCount] = useState(0)
  const [userLiked, setUserLiked] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')

  const thumbnailPrefix = 'https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail/'

  // Fetch likes count and check if user has liked this anime
  useEffect(() => {
    const fetchLikes = async () => {
      try {
        // Get all likes for this anime using subcollection
        const likesRef = collection(db, `versions/1/animes/${props.id}/likes`)
        const querySnapshot = await getDocs(likesRef)

        // Set the like count
        setLikeCount(querySnapshot.size)

        // Check if current user has liked this anime
        if (user.props.uid) {
          const userLikeDocRef = doc(db, `versions/1/animes/${props.id}/likes/${user.props.uid}`)
          const userLikeDoc = await getDoc(userLikeDocRef)
          setUserLiked(userLikeDoc.exists())
        } else {
          setUserLiked(false)
        }
      } catch (error) {
        console.error('Error fetching likes:', error)
      }
    }

    fetchLikes()
  }, [props.id, user.props.uid])

  // Handle Snackbar close
  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  // Handle like/unlike
  const handleLikeToggle = async () => {
    if (!user.props.uid) {
      // User is not logged in, can't like
      setSnackbarMessage('Please log in to like this anime')
      setSnackbarOpen(true)
      return
    }

    try {
      // Use subcollection structure
      const likeRef = doc(db, `versions/1/animes/${props.id}/likes/${user.props.uid}`)

      if (userLiked) {
        // Unlike
        await deleteDoc(likeRef)
        setLikeCount(prev => prev - 1)
        setUserLiked(false)
      } else {
        // Like
        await setDoc(likeRef, {
          userId: user.props.uid,
          createdAt: serverTimestamp()
        })
        setLikeCount(prev => prev + 1)
        setUserLiked(true)
      }
    } catch (error) {
      console.error('Error toggling like:', error)
    }
  }

  return (
    <MyBox display="flex">
      <Thumbnail src={thumbnailPrefix + props.id + '.jpg'} sx={{width: 80, height: 80}}/>
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
            {props.cours.map((e, index) => (
              <Typography sx={{lineHeight: 1.2, fontSize: 8}} key={index} variant="caption" color={'#aaa'}>
                {index != 0 ? '/' + e : e}
              </Typography>
            ))}
          </Box>
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
