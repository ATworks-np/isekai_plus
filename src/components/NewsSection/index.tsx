import React from 'react';
import { Box, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import type { LatestNews } from '@/lib/news';

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

const NewsSection = async ({ latestNews }: { latestNews: LatestNews | null }) => {
  const t = await getTranslations('news')
  if (!latestNews) {
    return (
      <Box sx={shellSx}>
        <Typography variant="body2" noWrap>
          {t('empty')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={shellSx}>
      <Typography
        variant="body2"
        color="primary.dark"
        sx={{ fontWeight: 'bold', flexShrink: 0 }}
      >
        {t('label')}
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
