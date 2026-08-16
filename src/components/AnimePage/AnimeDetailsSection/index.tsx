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
import type { Credits } from '@/lib/credits'
import { useTranslations } from 'next-intl'

/** A label and its value, the shape every row here is made of. */
const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Stack direction="row" spacing={1} sx={{ py: 0.15 }}>
    <Typography
      variant="caption"
      // Capped as well as proportional: 40% of a phone is a sensible label
      // column, 40% of a desktop leaves the value stranded across the page.
      sx={{ flex: '0 0 40%', maxWidth: 180, color: 'text.secondary', lineHeight: 1.6 }}
    >
      {label}
    </Typography>
    <Typography variant="caption" sx={{ flex: 1, lineHeight: 1.6 }}>
      {value}
    </Typography>
  </Stack>
)

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box sx={{ pt: 1.5, '&:first-of-type': { pt: 0 } }}>
    <Typography
      variant="caption"
      sx={{ display: 'block', fontWeight: 'bold', color: 'text.secondary', mb: 0.25 }}
    >
      {title}
    </Typography>
    {children}
  </Box>
)

/**
 * Staff, cast and theme songs, behind one fold.
 *
 * Everything is caption sized and the whole thing opens at once: the page is
 * about the reader's rating and the comments, and three separate headings for
 * lists nobody has asked to see yet compete with both.
 */
const AnimeDetailsSection: React.FC<{ credits: Credits }> = ({ credits }) => {
  const t = useTranslations('details')

  const hasStaff = credits.studios.length > 0 || credits.staff.length > 0
  const hasFold = hasStaff || credits.cast.length > 0 || credits.themeSongs.length > 0

  if (!credits.summary && !hasFold) return null

  return (
    <Box sx={{ width: '100%', maxWidth: '800px', px: 2 }}>
      {credits.summary && (
        <Typography
          component="p"
          variant="caption"
          sx={{ display: 'block', py: 1.5, lineHeight: 1.8, color: 'text.secondary' }}
        >
          {credits.summary}
        </Typography>
      )}
      {hasFold && (
      <Accordion
        disableGutters
        elevation={0}
        square
        sx={{ backgroundColor: 'transparent', '&:before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
          sx={{ minHeight: 0, px: 0, '& .MuiAccordionSummary-content': { my: 1 } }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('heading')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0, pt: 0, pb: 2 }}>
          {hasStaff && (
            <Section title={t('staff')}>
              {credits.studios.length > 0 && (
                <Row label={t('studio')} value={credits.studios.join('、')} />
              )}
              {credits.staff.map((entry, index) => (
                <Row key={`${entry.role}-${index}`} label={entry.role} value={entry.name} />
              ))}
            </Section>
          )}

          {credits.cast.length > 0 && (
            <Section title={t('cast')}>
              {credits.cast.map((entry, index) => (
                <Row
                  key={`${entry.name}-${index}`}
                  label={entry.character || t('uncredited')}
                  value={entry.name}
                />
              ))}
            </Section>
          )}

          {credits.themeSongs.length > 0 && (
            <Section title={t('themeSongs')}>
              {credits.themeSongs.map((song, index) => (
                <Row
                  key={`${song.type}-${index}`}
                  label={song.type}
                  value={[song.title && `「${song.title}」`, song.artist].filter(Boolean).join(' ')}
                />
              ))}
            </Section>
          )}
        </AccordionDetails>
      </Accordion>
      )}
    </Box>
  )
}

export default AnimeDetailsSection
