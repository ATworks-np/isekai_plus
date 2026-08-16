'use client'

import * as React from 'react'
import {
  Box,
  Button,
  Chip,
  Divider,
  Link,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/firebase'

const QUEUE_PATH = 'versions/1/tagProposals'
const TAGS_PATH = 'versions/1/tags'
const ANIMES_PATH = 'versions/1/animes'

type Proposal = {
  tagId: string | null
  name: string
  who: string
  passes: number
}

type Entry = {
  id: string
  animeId: string
  name: string
  axis: string
  images: string[]
  characterPageUrl: string
  proposals: Proposal[]
}

/**
 * The queue of tags a script has proposed, waiting for someone to say yes.
 *
 * One work at a time, with the pictures the proposal was made from. Approval is
 * coarse on purpose: the whole set goes in with one press, and a wrong one is
 * taken out of the set first. Reading a hundred and fifty-five works goes at the
 * speed of the slowest interaction, and asking for a press per tag would be
 * three or four times that for an answer that is usually "yes, all of them".
 *
 * The proposals live in their own collection rather than on the work, so
 * nothing a model said reaches the site until it has been read. A fabricated
 * season went live once; the queue is the reason a fabricated tag will not.
 */
const TagReview: React.FC = () => {
  const [queue, setQueue] = React.useState<Entry[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [saving, setSaving] = React.useState<boolean>(false)
  const [dropped, setDropped] = React.useState<Set<string>>(new Set())
  const [done, setDone] = React.useState<number>(0)

  // Read once on mount. The queue shrinks from here as each work is answered,
  // so there is nothing to re-read until the page is opened again.
  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      const snapshot = await getDocs(collection(db, QUEUE_PATH))
      if (cancelled) return
      setQueue(
        snapshot.docs
          .filter(entry => (entry.get('status') ?? 'pending') === 'pending')
          .map(entry => ({
            id: entry.id,
            animeId: entry.get('animeId') ?? entry.id,
            name: entry.get('name') ?? '',
            axis: entry.get('axis') ?? '',
            images: (entry.get('images') ?? []) as string[],
            characterPageUrl: entry.get('characterPageUrl') ?? '',
            proposals: (entry.get('proposals') ?? []) as Proposal[],
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      )
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const current = queue[0]

  const next = () => {
    setQueue(rest => rest.slice(1))
    setDropped(new Set())
    setDone(count => count + 1)
  }

  const approve = async () => {
    if (!current) return
    setSaving(true)
    try {
      const keeping = current.proposals.filter(
        proposal => proposal.tagId && !dropped.has(proposal.name)
      )
      if (keeping.length) {
        await updateDoc(doc(db, ANIMES_PATH, current.animeId), {
          tags: arrayUnion(...keeping.map(proposal => doc(db, TAGS_PATH, proposal.tagId as string))),
          // Reviewed is recorded whether or not anything was kept: an axis
          // nobody has looked at and an axis with nothing to say are otherwise
          // the same empty, and the second one is finished work.
          [`tagging.reviewed.${current.axis}`]: new Date(),
        })
      } else {
        await updateDoc(doc(db, ANIMES_PATH, current.animeId), {
          [`tagging.reviewed.${current.axis}`]: new Date(),
        })
      }
      await deleteDoc(doc(db, QUEUE_PATH, current.id))
      next()
    } finally {
      setSaving(false)
    }
  }

  const reject = async () => {
    if (!current) return
    setSaving(true)
    try {
      await updateDoc(doc(db, ANIMES_PATH, current.animeId), {
        [`tagging.reviewed.${current.axis}`]: new Date(),
      })
      await deleteDoc(doc(db, QUEUE_PATH, current.id))
      next()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="text" height={32} width={220} />
        <Skeleton variant="rectangular" height={220} />
        <Stack direction="row" spacing={1}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="rectangular" width={90} height={32} />
          ))}
        </Stack>
        <Skeleton variant="rectangular" height={40} />
      </Stack>
    )
  }

  if (!current) {
    return (
      <Stack spacing={1} sx={{ py: 4 }} alignItems="center">
        <Typography variant="h6">レビュー待ちはありません</Typography>
        <Typography variant="body2" color="text.secondary">
          {done > 0
            ? `この画面で ${done}件 を処理しました`
            : 'scripts/suggest-character-tags.mjs --push で提案を送れます'}
        </Typography>
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="h6">{current.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          残り {queue.length}件{done > 0 && ` / 済 ${done}件`}
        </Typography>
      </Stack>

      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
        {current.images.map((src, index) => (
          // The pictures the answer was read from, at a size a face is visible
          // at. Plain img: these are third-party hosts the image loader is not
          // configured for, and a broken frame here means a proposal that
          // cannot be checked.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={index}
            src={src}
            alt={`${current.name} ${index + 1}`}
            style={{ height: 240, width: 'auto', borderRadius: 8, flexShrink: 0 }}
          />
        ))}
      </Box>

      {current.characterPageUrl && (
        <Link href={current.characterPageUrl} target="_blank" rel="noopener" variant="body2">
          公式のキャラクター紹介を開く
        </Link>
      )}

      <Divider />

      <Typography variant="body2" color="text.secondary">
        違うものを押して外してから、まとめて承認してください
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {current.proposals.map(proposal => {
          const out = dropped.has(proposal.name)
          return (
            <Chip
              key={proposal.name}
              label={`${proposal.name}${proposal.passes < 3 ? ` (${proposal.passes}/3)` : ''}`}
              color={out ? 'default' : 'primary'}
              variant={out ? 'outlined' : 'filled'}
              onClick={() =>
                setDropped(previous => {
                  const next = new Set(previous)
                  if (next.has(proposal.name)) next.delete(proposal.name)
                  else next.add(proposal.name)
                  return next
                })
              }
              sx={{ textDecoration: out ? 'line-through' : 'none' }}
            />
          )
        })}
      </Box>

      <Stack spacing={0.5}>
        {current.proposals
          .filter(proposal => !dropped.has(proposal.name))
          .map(proposal => (
            <Typography key={proposal.name} variant="caption" color="text.secondary">
              {proposal.name} — {proposal.who}
            </Typography>
          ))}
      </Stack>

      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={approve} disabled={saving} fullWidth>
          {dropped.size
            ? `${current.proposals.length - dropped.size}件を承認`
            : 'すべて承認'}
        </Button>
        <Button variant="outlined" color="inherit" onClick={reject} disabled={saving}>
          全部違う
        </Button>
      </Stack>
    </Stack>
  )
}

export default TagReview
