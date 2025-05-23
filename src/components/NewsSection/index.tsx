'use client'

import React from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import useNews from '@/hooks/useNews';

const NewsSection: React.FC = () => {
  const { latestNews, loading, error } = useNews();

  if (loading || error || !latestNews) {
    return null;
  }

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
