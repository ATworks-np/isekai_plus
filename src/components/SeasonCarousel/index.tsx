'use client'

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Stack, Typography, useTheme, IconButton, Skeleton } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { api } from '@/Routes/routs'
import { getThumbnailURL, getAnimeURL } from '@/utils/url'
import StarRating from '@/components/StarRating'
import { Link } from '@/i18n/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { courLabel } from '@/utils/cour'

type AnimeItem = {
  id: string
  name: { ja: string; en?: string }
  thumbnail: string
  cours: string[]
  rating?: number
}

const getCurrentCoursKey = () => {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const currentQuarterIndex = Math.floor((currentMonth - 1) / 3) // 0..3
  return `${currentYear}-Q${currentQuarterIndex + 1}`
}

type SeasonCarouselProps = {
  // 外部から明示的にスケルトン表示を強制したい場合に使用
  // true のときはデータ状態に関わらずスケルトンUIを描画します
  skeleton?: boolean
}

const subscribeToReducedMotion = (onStoreChange: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', onStoreChange)
  return () => query.removeEventListener('change', onStoreChange)
}

const getReducedMotionSnapshot = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const getServerReducedMotionSnapshot = () => false

const SeasonCarousel: React.FC<SeasonCarouselProps> = ({ skeleton = false }) => {
  const t = useTranslations('list')
  const locale = useLocale()
  const theme = useTheme()
  const [animes, setAnimes] = useState<AnimeItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [rawIndex, setIndex] = useState<number>(0)
  const [isHovering, setIsHovering] = useState<boolean>(false)
  const [isPointerDown, setIsPointerDown] = useState<boolean>(false)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  // The server snapshot is stable for hydration; React then reads and
  // subscribes to the reader's actual browser preference.
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot
  )

  useEffect(() => {
    fetch(api.animes)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        return response.json()
      })
      .then((data) => {
        setAnimes(data)
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  const currentCours = useMemo(() => getCurrentCoursKey(), [])

  const currentSeasonAnimes = useMemo(
    () => animes.filter((a) => Array.isArray(a.cours) && a.cours.includes(currentCours)),
    [animes, currentCours]
  )

  // Clamped while rendering rather than corrected afterwards: an effect would
  // paint one frame with an index past the end of a shortened list.
  const index = currentSeasonAnimes.length > 0 && rawIndex >= currentSeasonAnimes.length ? 0 : rawIndex

  // Auto-play every 5s, pause on hover (mouse only), while dragging, or when tab hidden
  useEffect(() => {
    // Cleanup existing timer before possibly creating a new one
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (loading || currentSeasonAnimes.length <= 1) return
    if (isHovering || isPointerDown) return
    if (prefersReducedMotion) return
    if (typeof document !== 'undefined' && document.hidden) return

    intervalRef.current = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % currentSeasonAnimes.length)
    }, 5000)

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [loading, currentSeasonAnimes.length, isHovering, isPointerDown, prefersReducedMotion])

  // Pause/resume on tab visibility change
  useEffect(() => {
    const onVisibility = () => {
      // trigger the autoplay effect to reevaluate
      setIsHovering((h) => h)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [])

  const goNext = () => {
    if (currentSeasonAnimes.length === 0) return
    setIndex((prev) => (prev + 1) % currentSeasonAnimes.length)
  }
  const goPrev = () => {
    if (currentSeasonAnimes.length === 0) return
    setIndex((prev) => (prev - 1 + currentSeasonAnimes.length) % currentSeasonAnimes.length)
  }

  // Basic swipe handling (mouse/touch)
  const onPointerDown = (clientX: number) => {
    setIsPointerDown(true)
    setDragStartX(clientX)
  }
  const onPointerUp = (clientX: number | null) => {
    if (!isPointerDown) return
    setIsPointerDown(false)
    if (dragStartX == null || clientX == null) return
    const dx = clientX - dragStartX
    const threshold = 40 // px
    if (dx > threshold) {
      goPrev()
    } else if (dx < -threshold) {
      goNext()
    }
    setDragStartX(null)
  }
  const onPointerMove = (clientX: number) => {
    // We don't do drag translate visuals to keep it simple; only evaluate on release
  }

  // skeleton の有効判定
  const skeletonActive = skeleton || loading

  // スケルトン表示
  if (skeletonActive) {
    return (
      <Box
        role="region"
        aria-roledescription="carousel"
        aria-label={t('carousel')}
        aria-busy={true}
        sx={{
          //padding: '100px',
          width: '100%',
          height: { xs: 350, sm: 350, md: 400 },
          maxHeight: 400,
          position: 'relative',
          borderRadius: 0,
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {/* 背景の代替（薄いぼかし風の面） */}

        <Stack
          direction="row"
          spacing={2}
          sx={{
            width: '100px',
            margin: '16px 0px',
            position: 'relative',
            zIndex: 1,
            height: '100%',
            alignItems: 'center',
            px: 2,
          }}
        >
          {/* 左サムネ サイズ合わせ */}
          <Skeleton
            variant="rounded"
            sx={{ width: 160, height: 220, borderRadius: '12px', flex: '0 0 auto' }}
          />

          {/* 右テキスト領域 */}
          <Box sx={{ flex: '1 1 auto' }}>
            <Skeleton variant="text" width="80%" height={28} />
            <Skeleton variant="text" width="70%" height={28} />
            <Box sx={{ mt: 0.5 }}>
              <Skeleton variant="rounded" width={120} height={18} />
            </Box>
            <Box sx={{ mt: 0.5 }}>
              <Skeleton variant="text" width={100} height={18} />
            </Box>
          </Box>
        </Stack>
      </Box>
    )
  }

  // データは読み込み済みだが今季対象が0件の場合は非表示
  if (currentSeasonAnimes.length === 0) return null

  return (
    <Box
      role="region"
      aria-roledescription="carousel"
      aria-label={t('carousel')}
      sx={{
        padding: '100px',
        width: '100%',
        // 明示的な高さを指定し、絶対配置の子要素で高さ0にならないようにする
        height: { xs: 350, sm: 350, md: 400 },
        maxHeight: 400,
        position: 'relative',
        borderRadius: 0,
        overflow: 'hidden',
      }}
      // Hover pause: only for mouse pointers
      onPointerEnter={(e) => {
        if ((e as React.PointerEvent).pointerType === 'mouse') setIsHovering(true)
      }}
      onPointerLeave={(e) => {
        if ((e as React.PointerEvent).pointerType === 'mouse') setIsHovering(false)
      }}
      onTouchStart={(e) => onPointerDown(e.touches[0].clientX)}
      onTouchEnd={(e) => onPointerUp(e.changedTouches[0]?.clientX ?? null)}
      onMouseDown={(e) => onPointerDown(e.clientX)}
      onMouseUp={(e) => onPointerUp(e.clientX)}
    >
      {/* Slides (cross-fade) */}
      {currentSeasonAnimes.map((anime, i) => {
        const active = i === index
        const bgUrl = getThumbnailURL(anime.id)
        return (
          <Box
            key={anime.id}
            aria-hidden={!active}
            sx={{
              position: 'absolute',
              inset: 0,
              height: '100%',
              transition: 'opacity 600ms ease',
              opacity: active ? 1 : 0,
              // 非アクティブスライドがクリックをブロックしないようにする
              pointerEvents: active ? 'auto' : 'none',
            }}
          >
            {/* Blurred background */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${bgUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(50px)',
                transform: 'scale(1.1)',
                margin: '50px',
              }}
            />

            {/* Foreground content (clickable to detail page) */}
            <Link
              href={getAnimeURL(anime.id)}
              style={{ textDecoration: 'none' }}
              aria-label={`${anime.name?.ja || anime.name?.en} の詳細ページへ`}
            >
              <Stack
                direction="row"
                spacing={2}
                sx={{
                  margin: '16px 0px',
                  position: 'relative',
                  zIndex: 1,
                  height: '100%',
                  alignItems: 'center',
                  px: 2,
                  cursor: 'pointer',
                }}
              >
                {/* Left thumbnail */}
                <Box
                  sx={{
                    width: 160,
                    height: 220,
                    borderRadius: '12px',
                    backgroundImage: `url(${bgUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    boxShadow: 3,
                    flex: '0 0 auto',
                  }}
                  aria-label={`thumbnail ${anime.name.ja}`}
                />

                {/* Right title */}
                <Box sx={{ color: theme.palette.common.white, overflow: 'hidden', flex: '1 1 auto' }}>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      textOverflow: 'ellipsis',
                      wordBreak: 'break-word',
                    }}
                  >
                    {anime.name?.ja || anime.name?.en}
                  </Typography>
                  {/* Rating stars under the title */}
                  <Box sx={{ mt: 0.5 }}>
                    <StarRating rating={anime.rating ?? 0} sx={{ fontSize: 18}} />
                  </Box>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>
                    {t('thisSeason', { cour: courLabel(currentCours, locale) ?? currentCours })}
                  </Typography>
                </Box>
              </Stack>
            </Link>
          </Box>
        )
      })}

      {/* Nav buttons */}
      {currentSeasonAnimes.length > 1 && (
        <>
          <IconButton
            aria-label="前へ"
            onClick={goPrev}
            sx={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', color: 'white', bgcolor: 'rgba(0,0,0,0.3)', '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' }, zIndex: 2 }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            aria-label="次へ"
            onClick={goNext}
            sx={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', color: 'white', bgcolor: 'rgba(0,0,0,0.3)', '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' }, zIndex: 2 }}
          >
            <ChevronRightIcon />
          </IconButton>
        </>
      )}

      {/* Indicators */}
      {currentSeasonAnimes.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ position: 'absolute', bottom: 8, left: 0, right: 0, justifyContent: 'center', zIndex: 2, pointerEvents: 'auto' }}>
          {currentSeasonAnimes.map((_, i) => (
            <Box
              key={i}
              onClick={() => setIndex(i)}
              role="button"
              aria-label={`スライド ${i + 1}`}
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: i === index ? 'primary.main' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                boxShadow: 1,
              }}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

export default SeasonCarousel
