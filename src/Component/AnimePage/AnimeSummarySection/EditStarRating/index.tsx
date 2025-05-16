import React from "react";
import {Box, Typography} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarHalfIcon from "@mui/icons-material/StarHalf";
import StarOutlineIcon from "@mui/icons-material/StarOutline";

interface StarRatingProps {
  rating: number; // 平均評価 (0 ~ 5)
  setRating: (value: number) => void;
}

const StarRating: React.FC<StarRatingProps> = ({ rating, setRating }) => {
  const fullStars = rating; // 完全な星の数
  const emptyStars = 5 - fullStars; // 空の星の数

  return (
    <Box display="flex" alignItems="center">
      {/* 完全な星 */}
      {Array.from({ length: fullStars }, (_, i) => (
        <StarIcon key={`full-${i}`} fontSize={'small'} color="primary" onClick={()=>setRating(i+1)}/>
      ))}

      {/* 空の星 */}
      {Array.from({ length: emptyStars }, (_, i) => (
        <StarOutlineIcon key={`empty-${i}`} fontSize={'small'} color="primary" onClick={()=>setRating(fullStars+i+1)}/>
      ))}
    </Box>
  );
};

export default StarRating;