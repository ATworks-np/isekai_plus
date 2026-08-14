import React, { useState } from 'react'
import { useAtom } from 'jotai'
import { Box, Button, CircularProgress, Container, Modal, Stack, Typography } from '@mui/material'
import { getAuth } from 'firebase/auth'
import theme from '@/theme/theme'
import EditStarRatingsSection from '@/components/AnimePage/AnimeSummarySection/EditStarRatingsSection'
import { IRatings, ratingLabels } from '@/models/interfaces/ratings'
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
  const [user] = useAtom(userAtom)
  const { myRatings, reloadMyRatings } = useSeasonMyRatings(animeId, seasonId)
  // null until the user touches a star, so ratings loading in are shown
  // without an effect copying them into state.
  const [draft, setDraft] = useState<IRatings | null>(null)
  const ratings = draft ?? myRatings
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [message, setMessage] = useAtom<string>(customSnackbarAtom)

  /**
   * Posting to the API instead of writing Firestore directly: the server folds
   * the user's rating, the season aggregate and the series average into one
   * transaction, which the old trigger chain could not guarantee.
   */
  const handleSubmit = async () => {
    if (!seasonId) return
    const currentUser = getAuth().currentUser
    if (!currentUser) {
      setMessage('ログインが必要です')
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
      setMessage('送信しました')
      setOpen(false)
    } catch (error) {
      setMessage(`送信に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={user.isAuthenticated() && open} onClose={() => setOpen(false)}>
      <Container sx={style}>
        <Stack alignItems="center" spacing={1}>
          <Typography>星を付ける</Typography>
          {seasonLabel && (
            <Typography variant="caption" color="text.secondary">
              {seasonLabel} の評価
            </Typography>
          )}
          <EditStarRatingsSection
            ratings={ratings}
            ratingLabels={ratingLabels}
            setRating={(key, rate) => setDraft({ ...ratings, [key]: rate })}
          />
          <Button
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            fullWidth
            disabled={submitting || !seasonId}
            sx={{ mt: 2 }}
          >
            {submitting ? <CircularProgress size={24} /> : '送信'}
          </Button>
        </Stack>
      </Container>
    </Modal>
  )
}

export default RatingModal
