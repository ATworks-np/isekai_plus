import React from 'react'
import Grid from "@mui/material/Grid";
import useAnime from "@/hooks/useAnime";
import {Box, Container, Stack, Tab, Tabs, Typography} from "@mui/material";
import useSeasons from "@/hooks/useSeasons";
import StarRating from "@/components/StarRating";
import HelpIcon from '@mui/icons-material/Help';
import RatingModal from "@/components/AnimePage/AnimeSummarySection/RatingModal";
import {IRatings} from "@/models/interfaces/ratings";
import AddTitle from "@/components/AdminPage/AddTitle";
import AnimeTitle from "@/components/AnimePage/AnimeSummarySection/AnimeTitle";
import useUser from "@/hooks/useUser";
import Image from "next/image";
import Button from "@mui/material/Button";
import StarIcon from '@mui/icons-material/Star';
import {IAnimeStatic} from "@/models/interfaces/animeStatic";
import {useAtom} from "jotai";
import { userAtom } from '@/stores/userStore';
const ratingLabels = {
  story: 'ストーリー',
  character: 'キャラ',
  animation: '作画',
  worldview: '世界観',
  message: 'テーマ性'
}


const AnimeSummarySection: React.FC<IAnimeStatic> = props => {
  const [anime] = useAnime({id: props.id});
  const [user, setUser] = useAtom(userAtom);
  const thumbnailPrefix = 'https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail/'
  const [openRatingModal, setOpenRatingModal] = React.useState(false);
  const { seasons, reloadSeasons } = useSeasons(props.id);
  const [selectedSeasonId, setSelectedSeasonId] = React.useState<string>('');

  // Derived rather than synced through an effect, so a season loading in does
  // not need a second render to pick a default.
  const activeSeason =
    seasons.find(season => season.id === selectedSeasonId) ?? seasons[seasons.length - 1];
  // The latest season is what a visitor arriving during a broadcast came for.
  const showTabs = seasons.length > 1;
  const ratings = activeSeason?.ratings ?? anime.props.ratings;

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        maxWidth: "800px",
        height: showTabs ? "378px" : "330px",
      }}
    >
      <RatingModal
        open={openRatingModal}
        setOpen={setOpenRatingModal}
        animeId={props.id}
        seasonId={activeSeason?.id}
        seasonLabel={showTabs ? activeSeason?.label : undefined}
        onSaved={reloadSeasons}
      />
      <Box
        sx={{
          width: "100%",
          height: showTabs ? "348px" : "300px",
          backgroundImage: `url(${thumbnailPrefix + props.id + '.jpg'})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(50px)", // ぼかし効果を適用
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",

          // transform: "translate(-50%, -50%)",
        }}
      >
        <Box style={{height: '60px'}}/>
        <Grid container spacing={2}>
          <Grid size={0.5} />
          <Grid size={11} >
            <AnimeTitle name={props.name.ja}/>
          </Grid>
          <Grid size={0.5} />
        </Grid>
        {showTabs && (
          <Tabs
            value={activeSeason?.id ?? false}
            onChange={(_, value) => setSelectedSeasonId(value)}
            variant="scrollable"
            scrollButtons={false}
            sx={{
              minHeight: 40,
              px: 2,
              '& .MuiTab-root': { color: 'rgba(255,255,255,0.7)', minHeight: 40, py: 0 },
              '& .Mui-selected': { color: 'white' },
              '& .MuiTabs-indicator': { backgroundColor: 'white' },
            }}
          >
            {seasons.map(season => (
              <Tab key={season.id} value={season.id} label={season.label} />
            ))}
          </Tabs>
        )}
        <Box style={{height: '10px'}}/>
        <Grid container spacing={2}>
          <Grid size={0.5} />
          <Grid size={4}>
              <img
                src={thumbnailPrefix + props.id + '.jpg'}
                alt=""
                style={{
                  height: '180px',
                  objectFit: 'contain',
                }}
              />
          </Grid>
          <Grid size={7}>
            <Stack spacing={0}>
              {
                Object.entries(ratingLabels).map(([key, value]) => (
                  <Grid container spacing={0} key={key}>
                      <Grid size={4}>
                        <Typography
                          variant="caption"
                          sx={{
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                            color: 'white',
                          }}
                        >
                          {value}
                        </Typography>
                      </Grid>

                      <Grid size={7}>
                        <Container  sx={{
                          textAlign: 'left', // 左寄せ
                          marginLeft: 0, // 親要素の左端に寄せる
                          paddingLeft: 0, // 必要ならパディングも調整
                        }}
                        onClick={()=> user.isAuthenticated() && setOpenRatingModal(true)}
                        >
                          <StarRating rating={ratings[key as keyof IRatings]}/>
                        </Container>
                      </Grid>
                    </Grid>
                  ))
                }
              <Box style={{height: '10px'}}/>
              <Button
                variant="contained"
                onClick={() => user.isAuthenticated() && setOpenRatingModal(true)}
              >
                <StarIcon fontSize={'small'}/>
                <Typography variant={"caption"}>をつける</Typography>

              </Button>
            </Stack>

          </Grid>
        </Grid>
      </Box>
    </Box>

  )
}

export default AnimeSummarySection
