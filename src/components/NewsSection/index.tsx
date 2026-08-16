'use client'

import React from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import useNews from '@/hooks/useNews';

const shellSx = {
  my: 1,
  px: 1,
  width: '100%',
  maxWidth: '800px',
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  textAlign: 'center',
} as const;

const NewsSection: React.FC = () => {
  const { latestNews, loading, error } = useNews();

  if (loading) {
    return (
      <Box sx={shellSx} aria-busy>
        <Skeleton variant="text" width={64} height={20} sx={{ flexShrink: 0 }} />
        <Skeleton variant="text" width="60%" height={20} sx={{ ml: 1 }} />
      </Box>
    );
  }

  // Keep the section in place when Firestore has no item or cannot be reached.
  // Returning null on an error made the page jump after the loading skeleton.
  if (error || !latestNews) {
    return (
      <Box sx={shellSx}>
        <Typography variant="body2" noWrap>
          最新のお知らせはありません
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={shellSx}>
      <Typography
        variant="body2"
        color="primary"
        sx={{ fontWeight: 'bold', flexShrink: 0 }}
      >
        お知らせ:
      </Typography>
      <Typography
        variant="body2"
        noWrap
        sx={{ ml: 1, minWidth: 0 }}
      >
        {latestNews.name}
      </Typography>
    </Box>
  );
};

export default NewsSection;
