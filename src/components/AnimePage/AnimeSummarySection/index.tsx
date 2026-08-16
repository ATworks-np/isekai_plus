import React from 'react'
import Grid from "@mui/material/Grid";
import {Box, Container, Skeleton, Stack, Tab, Tabs, Typography} from "@mui/material";
import { Season } from "@/hooks/useSeasons";
import StarRating from "@/components/StarRating";
import HelpIcon from '@mui/icons-material/Help';
import RatingModal from "@/components/AnimePage/AnimeSummarySection/RatingModal";
import {baseRatings, IRatings, RATING_AXES} from "@/models/interfaces/ratings";
import AnimeTitle from "@/components/AnimePage/AnimeSummarySection/AnimeTitle";
import useUser from "@/hooks/useUser";
import Image from "next/image";
import Button from "@mui/material/Button";
import StarIcon from '@mui/icons-material/Star';
import {IAnimeStatic} from "@/models/interfaces/animeStatic";
import {useAtom} from "jotai";
import { userAtom } from '@/stores/userStore';
import { customSnackbarAtom } from '@/stores/customSnackbarState';
import { useRouter } from '@/i18n/navigation';
import { courRangeLabel } from '@/utils/cour';
import { useLocale, useTranslations } from 'next-intl'


type AnimeSummarySectionProps = IAnimeStatic & {
  seasons: Season[]
  activeSeason: Season | undefined
  loadingSeasons: boolean
  onSelectSeason: (seasonId: string) => void
  onRatingSaved: () => void
}

const AnimeSummarySection: React.FC<AnimeSummarySectionProps> = props => {
  const t = useTranslations('rating')
  const season = useTranslations('season')
  const work = useTranslations('work')
  const locale = useLocale()
  const router = useRouter()
  const [, setMessage] = useAtom<string>(customSnackbarAtom)

  // The work as the reader's language writes it. An English title is only
  // recorded once someone has written one, so Japanese stays the fallback.
  const title = (locale === 'ja' ? props.name.ja : props.name.en?.trim() || props.name.ja) ?? ''

  // The API numbers the seasons; the name is written in the reader's language.
  // A spinoff has no number and keeps the title it was stored with.
  const nameOf = (entry: Season) =>
    entry.seasonNumber ? season('numbered', { n: entry.seasonNumber }) : entry.label
  const [user, setUser] = useAtom(userAtom);
  const thumbnailPrefix = 'https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail/'
  const [openRatingModal, setOpenRatingModal] = React.useState(false);
  const { seasons, activeSeason } = props;
  // A season carries its own key visual once one has been stored; the series
  // image stays the fallback so nothing goes blank mid-migration.
  const thumbnail = activeSeason?.thumbnailUrl ?? thumbnailPrefix + props.id + '.jpg';
  const ratings = activeSeason?.ratings ?? props.ratings ?? baseRatings;
  // The season's own cours, not the work's: with the tabs open the reader is
  // looking at one season, and the work's span covers all of them.
  const courLabel = courRangeLabel(activeSeason?.cours ?? [], locale);

  // Pressing the stars while signed out did nothing at all, which reads as a
  // broken button. Say what is missing and go where it can be fixed.
  const openRating = () => {
    if (!user.isAuthenticated()) {
      setMessage(t('signIn'))
      router.push('/login')
      return
    }
    setOpenRatingModal(true)
  }

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        maxWidth: "800px",
        // Fixed: the tab strip is always there, so the header does not grow
        // by its height the moment the seasons arrive.
        height: "378px",
      }}
    >
      <RatingModal
        open={openRatingModal}
        setOpen={setOpenRatingModal}
        animeId={props.id}
        seasonId={activeSeason?.id}
        seasonLabel={activeSeason && nameOf(activeSeason)}
        onSaved={props.onRatingSaved}
      />
      <Box
        sx={{
          width: "100%",
          height: "348px",
          backgroundImage: `url(${thumbnail})`,
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
            <AnimeTitle name={title}/>
          </Grid>
          <Grid size={0.5} />
        </Grid>
        {/* Shown even for a single season. One tab reads as a label rather than
            a choice, and the strip being unconditional is what keeps the header
            a fixed height. */}
        {props.loadingSeasons ? (
          // 40px to the tab strip's 40, and the label indented by the strip's
          // padding plus the tab's own, so it lands where 第1期 will.
          <Box sx={{ height: 40, display: 'flex', alignItems: 'center', pl: '32px' }}>
            <Skeleton
              variant="text"
              width={58}
              sx={{ fontSize: '0.875rem', backgroundColor: 'rgba(255,255,255,0.2)' }}
            />
          </Box>
        ) : (
          <Tabs
            value={activeSeason?.id ?? false}
            onChange={(_, value) => props.onSelectSeason(value)}
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
            {seasons.map(entry => (
              <Tab key={entry.id} value={entry.id} label={nameOf(entry)} />
            ))}
          </Tabs>
        )}
        {/* The selected season's broadcast period belongs directly beneath
            its tab. The fixed-height row also prevents a shift when season
            data replaces the loading skeleton. */}
        <Box sx={{ height: 20, display: 'flex', alignItems: 'center', px: 4 }}>
          {props.loadingSeasons ? (
            <Skeleton
              variant="text"
              width={110}
              sx={{ fontSize: '0.75rem', backgroundColor: 'rgba(255,255,255,0.2)' }}
            />
          ) : (
            courLabel && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                {courLabel}
              </Typography>
            )
          )}
        </Box>
        <Box style={{height: '10px'}}/>
        <Grid container spacing={2}>
          <Grid size={0.5} />
          <Grid size={4}>
              <Image
                src={thumbnail}
                alt={work('keyVisual', { name: title })}
                width={240}
                height={360}
                priority
                sizes="(max-width: 800px) 33vw, 240px"
                style={{
                  width: '100%',
                  height: '180px',
                  objectFit: 'contain',
                }}
              />
          </Grid>
          <Grid size={7}>
            <Stack spacing={0}>
              {
                RATING_AXES.map(key => (
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
                          {t(key)}
                        </Typography>
                      </Grid>

                      <Grid size={7}>
                        <Container  sx={{
                          textAlign: 'left', // 左寄せ
                          marginLeft: 0, // 親要素の左端に寄せる
                          paddingLeft: 0, // 必要ならパディングも調整
                        }}
                        onClick={openRating}
                        >
                          {/* Zero is a score, so it cannot stand in for one that
                              has not arrived: the stars would fill in front of
                              the reader as though the work had just been rated. */}
                          {props.loadingSeasons ? (
                            // The row is 20px tall and there are five of them, so
                            // a skeleton even four pixels taller pushed the page
                            // below the header down by twenty. It is drawn
                            // shorter than the row and centred, which leaves the
                            // height to the label beside it and keeps the five
                            // from merging into one grey block.
                            <Box sx={{ height: 20, display: 'flex', alignItems: 'center' }}>
                              <Skeleton
                                variant="rectangular"
                                width={110}
                                height={12}
                                sx={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: '3px' }}
                              />
                            </Box>
                          ) : (
                            <StarRating rating={ratings[key as keyof IRatings]}/>
                          )}
                        </Container>
                      </Grid>
                    </Grid>
                  ))
                }
              <Box style={{height: '10px'}}/>
              <Button
                variant="contained"
                onClick={openRating}
              >
                <StarIcon fontSize={'small'}/>
                <Typography variant={"caption"}>{t('rate')}</Typography>

              </Button>
            </Stack>

          </Grid>
        </Grid>
      </Box>
    </Box>

  )
}

export default AnimeSummarySection
