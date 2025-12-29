'use client'

import React from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import useNews from '@/hooks/useNews';

const NewsSection: React.FC = () => {
  const { latestNews, loading, error } = useNews();

  if (error) return null;

  if (loading) {
    return (
      <Box sx={{ my: 1, width: '100%', maxWidth: '800px', textAlign: 'center' }} aria-busy>
        <Skeleton variant="text" width={64} height={20} sx={{ display: 'inline-block' }} />
        <Skeleton variant="text" width="60%" height={20} sx={{ display: 'inline-block', ml: 1 }} />
      </Box>
    );
  }

  if (!latestNews) return null;

  return (
    <Box sx={{ my: 1, width: '100%', maxWidth: '800px', textAlign: 'center' }}>
      <Typography 
        variant="body2" 
        color="primary"
        sx={{ fontWeight: 'bold', display: 'inline' }}
      >
        お知らせ:
      </Typography>
      <Typography 
        variant="body2" 
        sx={{ display: 'inline', ml: 1 }}
      >
        {latestNews.name}
      </Typography>
    </Box>
  );
};

export default NewsSection;
