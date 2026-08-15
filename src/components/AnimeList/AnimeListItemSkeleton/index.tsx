'use client'

import React from 'react'
import { Box, Skeleton, Stack } from '@mui/material'

/**
 * The shape of a row before its data arrives.
 *
 * Every measurement here is taken from AnimeListItem — the 80px thumbnail, the
 * 15px gutter, the three stacked lines — so the list does not change height
 * when the works land.
 */
const AnimeListItemSkeleton: React.FC = () => (
  <Box sx={{ display: 'flex', width: '100%', borderRadius: '20px', padding: '5px 10px' }}>
    <Skeleton variant="rectangular" width={80} height={80} sx={{ borderRadius: '10px', flexShrink: 0 }} />
    <Stack sx={{ ml: '15px', width: '100%', justifyContent: 'space-between' }}>
      <Skeleton variant="text" width="70%" sx={{ fontSize: '1rem' }} />
      <Skeleton variant="text" width="45%" sx={{ fontSize: '0.75rem' }} />
      <Skeleton variant="text" width="35%" sx={{ fontSize: '0.875rem' }} />
    </Stack>
  </Box>
)

export default AnimeListItemSkeleton
