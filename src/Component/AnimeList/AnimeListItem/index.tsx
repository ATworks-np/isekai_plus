import React from 'react'
import { Box, Chip } from '@mui/material'
import { styled } from '@mui/material'
import { Avatar } from '@mui/material'
import { Typography } from '@mui/material'

import IconButton from '@mui/material/IconButton'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import ForumIcon from '@mui/icons-material/Forum';
import { useAtom } from "jotai";
import StarRating from "@/Component/StarRating";
import Link from "next/link";
import {tagsAtom} from "@/store/tagStore";
import EditIcon from "@mui/icons-material/Edit";
import {userAtom} from "@/store/userStore";

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

  const thumbnailPrefix = 'https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail/'

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
          <IconButton aria-label="like" sx={{padding: '5px'}}>
            <FavoriteBorderIcon sx={{fontSize: 14, marginRight: '3px'}}/>
            <Typography sx={{lineHeight: 1.2, fontSize: 10}} variant="caption" color={'#aaa'}>
              0
            </Typography>
          </IconButton>
          <IconButton aria-label="like" sx={{padding: '5px'}}>
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
    </MyBox>
)
}

export default AnimeListItem
