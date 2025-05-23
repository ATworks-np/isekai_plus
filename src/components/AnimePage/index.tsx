'use client'

import logo from '../../logo.svg'
import React from 'react'
import styles from './tag.module.css'
import { Box, Chip, Stack, Typography } from '@mui/material'
import AnimeList from '../AnimeList'
import SearchModal from '@/components/SearchModal'
import LoginModal from '@/components/LoginModal'
import useUser from '@/hooks/useUser'
import AnimeSummarySection from "@/components/AnimePage/AnimeSummarySection";
import { useParams } from 'next/navigation'
import useAnime from "@/hooks/useAnime";
import CommentItem from "@/components/AnimePage/AnimeComment/CommentList/CommentItem";
import CommentList from "@/components/AnimePage/AnimeComment/CommentList";
import CommentInput from "@/components/AnimePage/CommentInput";
import AnimeComment from "@/components/AnimePage/AnimeComment";
import {string} from "prop-types";
import { IAnimeStatic } from "@/models/interfaces/animeStatic";

const AnimePage: React.FC<IAnimeStatic> = (props) => {
  const anime = useAnime({id: props.id ?? ""});

  return (
    props.id ?
      <Stack id='stack' direction="column" alignItems="center">
      <AnimeSummarySection {...props} />
      <AnimeComment id={props.id}/>
      <CommentInput id={props.id}/>
    </Stack> : null
  )
}

export default AnimePage
