'use client'

import logo from '../../logo.svg'
import React from 'react'
import styles from './tag.module.css'
import { Box, Chip, Stack, Typography } from '@mui/material'
import AnimeList from '../AnimeList'
import SearchModal from '@/Component/SearchModal'
import LoginModal from '@/Component/LoginModal'
import useUser from '@/hooks/useUser'
import AnimeSummarySection from "@/Component/AnimePage/AnimeSummarySection";
import { useParams } from 'next/navigation'
import useAnime from "@/hooks/useAnime";
import CommentItem from "@/Component/AnimePage/AnimeComment/CommentList/CommentItem";
import CommentList from "@/Component/AnimePage/AnimeComment/CommentList";
import CommentInput from "@/Component/AnimePage/CommentInput";
import AnimeComment from "@/Component/AnimePage/AnimeComment";
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
