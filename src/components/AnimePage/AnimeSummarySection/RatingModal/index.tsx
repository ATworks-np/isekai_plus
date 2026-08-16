import React, { useState } from 'react'
import { useAtom } from 'jotai'
import { Button, CircularProgress, Container, Modal, Stack, Typography } from '@mui/material'
import { getAuth } from 'firebase/auth'
import { useTranslations } from 'next-intl'
import theme from '@/theme/theme'
import EditStarRatingsSection from '@/components/AnimePage/AnimeSummarySection/EditStarRatingsSection'
import { IRatings, RATING_AXES } from '@/models/interfaces/ratings'
import useSeasonMyRatings from '@/hooks/useSeasonMyRatings'
import { customSnackbarAtom } from '@/stores/customSnackbarState'
import { userAtom } from '@/stores/userStore'

interface RatingModalProps {
  open: boolean
  setOpen: (open: boolean) => void
  animeId: string
  seasonId: string | undefined
  seasonLabel?: string
  onSaved?: () => void
}

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '100%',
  bgcolor: theme.palette.background.default,
  p: 2,
  maxWidth: '800px',
}

const RatingModal: React.FC<RatingModalProps> = ({
  open,
  setOpen,
  animeId,
  seasonId,
  seasonLabel,
  onSaved,
}) => {
  const t = useTranslations('rating')
  const [user] = useAtom(userAtom)
  const { myRatings, loading, reloadMyRatings } = useSeasonMyRatings(animeId, seasonId)
  // null until the user touches a star, so ratings loading in are shown
  // without an effect copying them into state.
  const [draft, setDraft] = useState<IRatings | null>(null)
  const ratings = draft ?? myRatings
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [, setMessage] = useAtom<string>(customSnackbarAtom)

  const labels = Object.fromEntries(RATING_AXES.map(key => [key, t(key)]))

  /**
   * Zero is the score for a work someone thought nothing of, not the absence of
   * an answer — but the form opens with all five axes at zero, so submitting
   * after picking one axis wrote four bottom scores into the season average.
   * An untouched axis is therefore not submittable, and is named so the reader
   * can see which one is holding the button.
   */
  const missing = RATING_AXES.filter(key => !ratings[key])

  /**
   * Posting to the API instead of writing Firestore directly: the server folds
   * the user's rating, the season aggregate and the series average into one
   * transaction, which the old trigger chain could not guarantee.
   */
  const handleSubmit = async () => {
    if (!seasonId || missing.length) return
    const currentUser = getAuth().currentUser
    if (!currentUser) {
      setMessage(t('signIn'))
      return
    }

    setSubmitting(true)
    try {
      const token = await currentUser.getIdToken()
      const response = await fetch(`/api/v1/animes/${animeId}/seasons/${seasonId}/ratings/`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${response.status}`)
      }

      setDraft(null)
      await reloadMyRatings()
      onSaved?.()
      setMessage(t('saved'))
      setOpen(false)
    } catch (error) {
      setMessage(t('failed', { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={user.isAuthenticated() && open} onClose={() => setOpen(false)}>
      <Container sx={style}>
        <Stack alignItems="center" spacing={1}>
          <Typography>{t('title')}</Typography>
          {seasonLabel && (
            <Typography variant="caption" color="text.secondary">
              {t('forSeason', { season: seasonLabel })}
            </Typography>
          )}
          <EditStarRatingsSection
            ratings={ratings}
            ratingLabels={labels}
            missingKeys={loading ? [] : missing}
            loading={loading}
            setRating={(key, rate) => setDraft({ ...ratings, [key]: rate })}
          />
          {!loading && missing.length > 0 && (
            <Typography variant="caption" color="error">
              {t('selectAll')}
            </Typography>
          )}
          <Button
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            fullWidth
            disabled={submitting || loading || !seasonId || missing.length > 0}
            sx={{ mt: 2 }}
          >
            {submitting ? <CircularProgress size={24} /> : t('submit')}
          </Button>
        </Stack>
      </Container>
    </Modal>
  )
}

export default RatingModal
