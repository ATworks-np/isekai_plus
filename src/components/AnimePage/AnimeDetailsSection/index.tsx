'use client'

import React from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import useCredits from '@/hooks/useCredits'

/** A label and its value, the shape every panel here is made of. */
const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Stack direction="row" spacing={1} sx={{ py: 0.25 }}>
    <Typography
      variant="caption"
      sx={{ minWidth: '38%', maxWidth: '38%', color: 'text.secondary' }}
    >
      {label}
    </Typography>
    <Typography variant="caption" sx={{ flex: 1 }}>
      {value}
    </Typography>
  </Stack>
)

const Panel: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({
  title,
  count,
  children,
}) => (
  <Accordion disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
        {count}件
      </Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
  </Accordion>
)

/**
 * Staff, cast and theme songs, folded away.
 *
 * Closed by default: the page is about the reader's rating and the comments,
 * and a thirty line cast list above them would bury both.
 */
const AnimeDetailsSection: React.FC<{ id: string }> = ({ id }) => {
  const { credits, loading } = useCredits(id)

  const hasStaff = credits.studios.length > 0 || credits.staff.length > 0
  if (loading || (!hasStaff && !credits.cast.length && !credits.themeSongs.length)) return null

  return (
    <Box sx={{ width: '100%', maxWidth: '800px', px: 2, pt: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 0.5 }}>
        作品情報
      </Typography>

      {hasStaff && (
        <Panel title="制作・スタッフ" count={credits.studios.length + credits.staff.length}>
          {credits.studios.length > 0 && (
            <Row label="アニメーション制作" value={credits.studios.join('、')} />
          )}
          {credits.staff.map((entry, index) => (
            <Row key={`${entry.role}-${index}`} label={entry.role} value={entry.name} />
          ))}
        </Panel>
      )}

      {credits.cast.length > 0 && (
        <Panel title="キャスト" count={credits.cast.length}>
          {credits.cast.map((entry, index) => (
            <Row
              key={`${entry.name}-${index}`}
              label={entry.character || '出演'}
              value={entry.name}
            />
          ))}
        </Panel>
      )}

      {credits.themeSongs.length > 0 && (
        <Panel title="主題歌" count={credits.themeSongs.length}>
          {credits.themeSongs.map((song, index) => (
            <Row
              key={`${song.type}-${index}`}
              label={song.type}
              value={[song.title && `「${song.title}」`, song.artist].filter(Boolean).join(' ')}
            />
          ))}
        </Panel>
      )}
    </Box>
  )
}

export default AnimeDetailsSection
