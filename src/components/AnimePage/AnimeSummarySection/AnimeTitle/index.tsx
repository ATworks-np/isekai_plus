import { Typography, Skeleton } from '@mui/material';
import React from "react";

const AnimeTitle: React.FC<{ name: string | undefined }> = props => {
  return (
    <>
      {props.name ? (
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 'bold',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            color: 'white',
            fontSize: '18px',
          }}
        >
          {props.name}
        </Typography>
      ) : (
        <Skeleton
          variant="text"
          width="100%"
          height="31.5px"
          sx={{
            fontWeight: 'bold',
            backgroundColor: 'rgba(255, 255, 255, 0.1)', // スケルトンの色を調整
          }}
        />
      )}
    </>
  );
}

export default AnimeTitle;
