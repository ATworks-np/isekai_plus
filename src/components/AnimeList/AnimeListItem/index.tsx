import React from 'react'
import Image from 'next/image'
import { Box } from '@mui/material'
import { styled } from '@mui/material'
import { Typography } from '@mui/material'

import IconButton from '@mui/material/IconButton'
import ForumIcon from '@mui/icons-material/Forum';
import { useAtom } from "jotai";
import StarRating from "@/components/StarRating";
import { Link } from '@/i18n/navigation';
import {tagsAtom} from "@/stores/tagStore";
import EditIcon from "@mui/icons-material/Edit";
import {userAtom} from "@/stores/userStore";
import { getThumbnailURL } from "@/utils/url"
import { Season } from "@/hooks/useSeasons"
import { useLocale, useTranslations } from 'next-intl'
import LikeButton from '@/components/AnimeList/AnimeListItem/LikeButton'

const MyBox = styled(Box)(({ theme }) => ({
  borderRadius: '20px',
  padding: '5px 10px',
  width: '100%',
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
  const locale = useLocale()
  const season = useTranslations('season')
  const list = useTranslations('list')
  const [tags, setTags] = useAtom(tagsAtom)
  const [user, setUser] = useAtom(userAtom)
  return (
    <MyBox display="flex">
      <Box sx={{ position: 'relative', flexShrink: 0, width: 80, height: 80 }}>
        <Image
          src={props.season?.thumbnailUrl ?? getThumbnailURL(props.id)}
          alt={(locale === 'ja' ? props.name.ja : props.name.en?.trim() || props.name.ja) ?? ''}
          fill
          sizes="80px"
          quality={72}
          style={{ objectFit: 'cover', borderRadius: 10 }}
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
            {props.season.seasonNumber
              ? season('numbered', { n: props.season.seasonNumber })
              : props.season.label}
          </Box>
        )}
      </Box>
      <SumaryBox>
        <Link href={`/animes/${props.id}`}>
          <Typography
            component="h3"
            variant="subtitle1"
            sx={{
              fontWeight: 'bold',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 1,
            }}
          >
            {locale === 'ja' ? props.name.ja : props.name.en?.trim() || props.name.ja}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={0}>
            {Object.keys(props.tags).length > 0 && props.tags.map((tag, index) => (
              <Typography sx={{lineHeight: 1.2, fontSize: 10}} key={index} variant="caption" color="primary.dark">
                {/* The tag's own language when it has one; 66 of 100 do. */}
                {(locale === 'ja' ? tags[tag]?.name.ja : tags[tag]?.name.en?.trim() || tags[tag]?.name.ja)}&nbsp;
              </Typography>
            ))}
          </Box>
        </Link>
        <Box display="flex" justifyContent="flex-start">
          <LikeButton animeId={props.id} initialCount={props.likeCount ?? 0} />
          <IconButton aria-label={list('commentCount', { count: props.commentCount ?? 0 })} sx={{padding: '5px'}}>
            <ForumIcon sx={{fontSize: 14, marginRight: '3px'}}/>
            <Typography sx={{lineHeight: 1.2, fontSize: 10}} variant="caption" color="text.secondary">
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
