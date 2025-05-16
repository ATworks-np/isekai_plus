import React from "react";
import {Box, Container, Typography} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarHalfIcon from "@mui/icons-material/StarHalf";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import Grid from "@mui/material/Grid";
import HelpIcon from "@mui/icons-material/Help";
import EditStarRating from "@/Component/AnimePage/AnimeSummarySection/EditStarRating";
import useAnimeMyRatings from "@/hooks/useAnimeMyRatings";
import {IRatings} from "@/models/interfaces/ratings";

interface StarRatingSectionProps {
  ratings: IRatings,
  ratingLabels:{[key:string]: string},
  setRating: (key:string, value: number) => void;
}

const EditStarRatingsSection: React.FC<StarRatingSectionProps> = (props) => {
  return (
    <Container style={{width:'100%', maxWidth:400}}>
      {
        Object.entries(props.ratingLabels).map(([key, label])=>(
          <Grid container spacing={0} style={{maxWidth: "400px"}} key={key}>
            <Grid size={4}>
              <Typography
                variant="caption"
                sx={{
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                }}
              >
                {label}
              </Typography>
            </Grid>
            <Grid size={7}>
              <Container  sx={{
                textAlign: 'left', // 左寄せ
                marginLeft: 0, // 親要素の左端に寄せる
                paddingLeft: 0, // 必要ならパディングも調整
              }}
              >
                <EditStarRating rating={props.ratings[key as keyof IRatings]} setRating={(rate)=>props.setRating(key, rate)}/>
              </Container>
            </Grid>
            <Grid size={1}>
              <HelpIcon fontSize={'small'} color={"disabled"}/>
            </Grid>
          </Grid>
        ))
      }
    </Container>
  );
};

export default EditStarRatingsSection;