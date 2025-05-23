import logo from '../../logo.svg'
import React from 'react'
import styles from './tag.module.css'
import { Box, Chip, Stack, Typography } from '@mui/material'
import AnimeList from '../AnimeList'
import SearchModal from '@/components/SearchModal'
import LoginModal from '@/components/LoginModal'
import useUser from '@/hooks/useUser'
import useTags from "@/hooks/useTags";
import SelectCoursSection from "@/components/SelectCoursSection";
import NewsSection from "@/components/NewsSection";
import Image from "next/image";
import type { CSSProperties } from 'react'

const stylesHead = {
  container:  {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    maxHeight: '300px',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '300px',
  },
}

const ListPage: React.FC = props => {
  return (
    <Stack>
      <div style={stylesHead.container}>
        <img src={'/icon.png'} alt="centered" style={stylesHead.image}/>
      </div>
      <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <NewsSection />
      </Box>
      <Stack spacing={2} sx={{width: '100%', maxWidth: '800px'}}>
        <SearchModal/>
        <SelectCoursSection/>
        <AnimeList/>
      </Stack>
    </Stack>
  )
}

export default ListPage
