'use client'

import logo from '../../logo.svg'
import React, { useEffect, useState, Suspense } from 'react'
import { db } from '@/firebase'
import { collection, getDocs, getDocsFromCache } from 'firebase/firestore'
import { Box, Chip, Stack } from '@mui/material'
import { styled } from '@mui/material'
import { Avatar } from '@mui/material'
import { Typography } from '@mui/material'
import ContentListItem from './AnimeListItem'
import CircularProgress from '@mui/material/CircularProgress'
import { useAtom } from 'jotai'
import { searchSelectedTagAtom } from '@/stores/searchSelectedTagAtom'
import { courAtom } from '@/stores/coursState'
import useTags from "@/hooks/useTags";
import {api} from "@/Routes/routs";

const MyChip = styled(Chip)(({ theme }) => ({
  borderRadius: '10px',
}))

const MyBox = styled(Box)(({ theme }) => ({
  borderRadius: '20px',
  padding: '20px',
  backgroundColor: '#FFF',
}))

const contents = {
  1: {
    name: '俺TSUEEE',
    thumbnailPath: './1.png',
  },
}

const Thumbnail = styled(Avatar)(({ theme }) => ({
  borderRadius: '20px',
}))

const SumaryBox = styled(Box)(({ theme }) => ({
  marginLeft: '20px',
}))

const AnimeList: React.FC = props => {
  const [animes, setAnimes] = useState<any[]>([])
  const [tagsState, setTagsState] = useAtom<string[]>(searchSelectedTagAtom)
  const [coursState, setCoursState] = useAtom<string[]>(courAtom)
  const {} = useTags();

  useEffect(() => {
    fetch(api.animes)
      .then((response) => {
        if (!response.ok) {
          // レスポンスがエラーの場合の処理
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json(); // JSON をパース
      })
      .then((data) => {
        // パースしたデータを使用
        setAnimes(data);
        // 必要に応じてUIや状態を更新
      })
      .catch((error) => {
        // エラー処理
        console.error("データ取得中にエラーが発生しました:", error);
      });
  }, [])

  const filteredAnimes = () => {
    return animes
      .filter(coursFilter) // コースのフィルタを適用
      .filter(tagFilter);  // タグのフィルタを適用
  };

  const tagFilter = (anime: any) => {
    if (!tagsState || tagsState.length === 0) return true;
    return tagsState.every((key) => anime.tags.includes(key));
  };

  const coursFilter = (anime: any) => {
    if (!coursState || coursState.length === 0) return true;
    return coursState.some((cours) => anime.cours.includes(cours));
  };

  return (
    <div style={styles.container}>
      <Stack spacing={2}>
        {animes.length > 0 ? (
          filteredAnimes().map((anime: any, index: number) => <ContentListItem key={index} {...anime} />)
        ) : (
          <Box sx={{ display: 'flex' }}>
            <CircularProgress color="secondary" />
          </Box>
        )}
      </Stack>
    </div>
  )
}

export default AnimeList

const styles = {
  container: {
    width: '100%',
  },
}
