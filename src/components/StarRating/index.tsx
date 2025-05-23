import React from "react";
import {Box, Typography} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarHalfIcon from "@mui/icons-material/StarHalf";
import StarOutlineIcon from "@mui/icons-material/StarOutline";

interface StarRatingProps {
  rating: number; // 平均評価 (0 ~ 5)
  sx?: {
    fontSize: number;
  }
}

const StarRating: React.FC<StarRatingProps> = ({ rating, sx }) => {
  const fullStars = Math.floor(rating); // 完全な星の数
  const halfStar = rating % 1 >= 0.5; // 半分の星が必要かどうか
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0); // 空の星の数

  return (
    <Box display="flex" alignItems="center">
      {/* 完全な星 */}
      {Array.from({ length: fullStars }, (_, i) => (
        <StarIcon key={`full-${i}`} fontSize={'small'} sx={sx} color="primary" />
      ))}

      {/* 半分の星 */}
      {halfStar && <StarHalfIcon fontSize={'small'} sx={sx} color="primary" />}

      {/* 空の星 */}
      {Array.from({ length: emptyStars }, (_, i) => (
        <StarOutlineIcon key={`empty-${i}`} fontSize={'small'} sx={sx} color="primary" />
      ))}
    </Box>
  );
};

export default StarRating;