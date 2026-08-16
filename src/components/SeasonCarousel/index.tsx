'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { Box, ButtonBase, IconButton, Stack, Typography, useTheme } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { Link } from '@/i18n/navigation'
import StarRating from '@/components/StarRating'
import type { AnimeListEntry } from '@/models/animeList'
import { courLabel } from '@/utils/cour'
import { useLocale, useTranslations } from 'next-intl'

const HERO_HEIGHT = { xs: 320, sm: 340, md: 360 } as const

type SeasonCarouselProps = {
  initialItems: AnimeListEntry[]
  currentCour: string
}

const thumbnailFor = (anime: AnimeListEntry, currentCour: string) =>
  anime.seasons.find(season => season.cours.includes(currentCour))?.thumbnailUrl ??
  anime.thumbnailUrl

/**
 * Interactive shell around server-provided carousel data.
 *
 * The first image is an actual high-priority image in the initial HTML. Only
 * the active slide is rendered, so ten invisible CSS backgrounds no longer
 * compete with the LCP request.
 */
const SeasonCarousel: React.FC<SeasonCarouselProps> = ({ initialItems, currentCour }) => {
  const t = useTranslations('list')
  const locale = useLocale()
  const theme = useTheme()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [preloadNext, setPreloadNext] = useState(false)

  const count = initialItems.length
  const activeIndex = count ? index % count : 0
  const active = initialItems[activeIndex]
  const next = count > 1 ? initialItems[(activeIndex + 1) % count] : undefined

  useEffect(() => {
    if (count <= 1 || paused) return
    const timer = window.setInterval(() => setIndex(value => (value + 1) % count), 5000)
    return () => window.clearInterval(timer)
  }, [count, paused])

  // The next small poster starts only after the initial page and LCP resource
  // have loaded. It keeps navigation responsive without joining the critical
  // request queue.
  useEffect(() => {
    const start = () => window.setTimeout(() => setPreloadNext(true), 500)
    if (document.readyState === 'complete') {
      const timer = start()
      return () => window.clearTimeout(timer)
    }
    window.addEventListener('load', start, { once: true })
    return () => window.removeEventListener('load', start)
  }, [])

  if (!active) {
    return <Box sx={{ width: '100%', height: HERO_HEIGHT, bgcolor: 'background.default' }} />
  }

  const imageUrl = thumbnailFor(active, currentCour)
  const title = (locale === 'ja' ? active.name.ja : active.name.en?.trim() || active.name.ja) ?? ''

  const go = (direction: 1 | -1) => {
    if (count <= 1) return
    setIndex(value => (value + direction + count) % count)
  }

  const endDrag = (clientX: number) => {
    if (dragStartX === null) return
    const delta = clientX - dragStartX
    if (delta > 40) go(-1)
    if (delta < -40) go(1)
    setDragStartX(null)
  }

  return (
    <Box
      role="region"
      aria-roledescription="carousel"
      aria-label={t('carousel')}
      onPointerEnter={event => event.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={event => {
        if (event.pointerType === 'mouse') setPaused(false)
        setDragStartX(null)
      }}
      onPointerDown={event => setDragStartX(event.clientX)}
      onPointerUp={event => endDrag(event.clientX)}
      sx={{
        width: '100%',
        height: HERO_HEIGHT,
        maxHeight: 360,
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'pan-y',
      }}
    >
      <Box sx={{ position: 'absolute', inset: -24 }}>
        <Image
          key={`background-${active.id}`}
          src={imageUrl}
          alt=""
          fill
          priority={activeIndex === 0}
          fetchPriority={activeIndex === 0 ? 'high' : 'auto'}
          sizes="100vw"
          quality={40}
          style={{ objectFit: 'cover', filter: 'blur(28px)', transform: 'scale(1.08)' }}
        />
        <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(16,28,32,0.28)' }} />
      </Box>

      <Link href={`/animes/${active.id}`} style={{ textDecoration: 'none' }}>
        <Stack
          direction="row"
          spacing={{ xs: 1.5, sm: 2 }}
          sx={{
            position: 'relative',
            zIndex: 1,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            px: { xs: 4.25, sm: 7 },
            cursor: 'pointer',
          }}
        >
          <Box
            sx={{
              position: 'relative',
              width: { xs: 132, sm: 160 },
              height: { xs: 198, sm: 220 },
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: 3,
              flex: '0 0 auto',
            }}
          >
            <Image
              key={`poster-${active.id}`}
              src={imageUrl}
              alt={title}
              fill
              sizes="(max-width: 600px) 132px, 160px"
              quality={78}
              style={{ objectFit: 'cover' }}
            />
          </Box>

          <Box sx={{ color: theme.palette.common.white, overflow: 'hidden', maxWidth: 420 }}>
            <Typography
              component="h2"
              variant="h6"
              sx={{
                fontWeight: 700,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                textOverflow: 'ellipsis',
                wordBreak: 'break-word',
                textShadow: '0 1px 4px rgba(0,0,0,0.55)',
              }}
            >
              {title}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <StarRating rating={active.rating ?? 0} sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {t('thisSeason', {
                cour: courLabel(currentCour, locale) ?? currentCour,
                rank: activeIndex + 1,
              })}
            </Typography>
          </Box>
        </Stack>
      </Link>

      {count > 1 && (
        <>
          <IconButton
            aria-label={t('carouselPrevious')}
            onClick={() => go(-1)}
            sx={{ position: 'absolute', top: '50%', left: 4, transform: 'translateY(-50%)', color: 'white', bgcolor: 'rgba(0,0,0,0.35)', zIndex: 2 }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            aria-label={t('carouselNext')}
            onClick={() => go(1)}
            sx={{ position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)', color: 'white', bgcolor: 'rgba(0,0,0,0.35)', zIndex: 2 }}
          >
            <ChevronRightIcon />
          </IconButton>
          <Stack direction="row" spacing={0.25} sx={{ position: 'absolute', bottom: 4, left: 0, right: 0, justifyContent: 'center', zIndex: 2 }}>
            {initialItems.map((anime, slideIndex) => (
              <ButtonBase
                key={anime.id}
                aria-label={t('carouselSlide', { n: slideIndex + 1 })}
                aria-current={slideIndex === activeIndex ? 'true' : undefined}
                onClick={() => setIndex(slideIndex)}
                sx={{ width: 28, height: 28, borderRadius: '50%' }}
              >
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: slideIndex === activeIndex ? 'primary.main' : 'rgba(255,255,255,0.7)', boxShadow: 1 }} />
              </ButtonBase>
            ))}
          </Stack>
        </>
      )}

      {preloadNext && next && (
        <Image
          src={thumbnailFor(next, currentCour)}
          alt=""
          width={160}
          height={220}
          sizes="160px"
          quality={70}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
      )}
    </Box>
  )
}

export default SeasonCarousel
