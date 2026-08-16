'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/firebase'

/** Kept in step with data/tags.yaml, which the tagger reads. */
const GROUPS = [
  { key: 'isekai', label: '異世界' },
  { key: 'reborn', label: '転生・転移' },
  { key: 'skill', label: 'スキル・能力' },
  { key: 'body', label: '外見' },
  { key: 'race', label: '種族' },
  { key: 'role', label: '役割・職業' },
  { key: 'place', label: '舞台' },
  { key: 'plot', label: '物語の型' },
  { key: 'mood', label: '作風' },
]

type Tag = {
  id: string
  ja: string
  en: string
  group: string
  criteria: string
  narrower: string[]
  excludedBy: string[]
  aliasOf: string | null
  used: number
}

const labelOf = (key: string) => GROUPS.find(group => group.key === key)?.label ?? '未分類'

/**
 * The tag vocabulary, which is what makes tags findable and what the automatic
 * tagger is judged against. The criteria live on the tag document rather than
 * in the tagger's source, so they can be corrected here without a deploy.
 */
const Tags: React.FC = () => {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [query, setQuery] = useState<string>('')
  const [group, setGroup] = useState<string>('all')
  const [editing, setEditing] = useState<Tag | null>(null)
  const [deleting, setDeleting] = useState<Tag | null>(null)
  const [saving, setSaving] = useState<boolean>(false)
  const [message, setMessage] = useState<string>('')

  // Defined inside the effect, like the site's other loaders: every setState
  // below sits after an await, which is what keeps it out of the render pass.
  useEffect(() => {
    const load = async () => {
      try {
        const [tagDocs, animeDocs] = await Promise.all([
          getDocs(collection(db, 'versions/1/tags')),
          getDocs(collection(db, 'versions/1/animes')),
        ])

        const used = new Map<string, number>()
        animeDocs.docs.forEach(anime => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(anime.get('tags') ?? []).forEach((ref: any) => {
            used.set(ref.id, (used.get(ref.id) ?? 0) + 1)
          })
        })

        setTags(
          tagDocs.docs.map(tag => ({
            id: tag.id,
            ja: tag.get('name')?.ja ?? '',
            en: tag.get('name')?.en ?? '',
            group: tag.get('group') ?? '',
            criteria: tag.get('criteria') ?? '',
            narrower: tag.get('narrower') ?? [],
            excludedBy: tag.get('excludedBy') ?? [],
            aliasOf: tag.get('aliasOf') ?? null,
            used: used.get(tag.id) ?? 0,
          }))
        )
      } catch (error) {
        console.error('タグの取得に失敗しました', error)
        setMessage('タグの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim()
    return tags
      .filter(tag => group === 'all' || tag.group === group)
      .filter(
        tag =>
          !needle ||
          tag.ja.includes(needle) ||
          tag.en.toLowerCase().includes(needle.toLowerCase()) ||
          tag.criteria.includes(needle)
      )
      .sort((a, b) => b.used - a.used)
  }, [tags, query, group])

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await setDoc(
        doc(db, 'versions/1/tags', editing.id),
        {
          name: { ja: editing.ja.trim(), en: editing.en.trim() },
          group: editing.group,
          criteria: editing.criteria.trim(),
          narrower: editing.narrower,
          excludedBy: editing.excludedBy,
          aliasOf: editing.aliasOf,
        },
        { merge: true }
      )
      setTags(previous => previous.map(tag => (tag.id === editing.id ? editing : tag)))
      setMessage(`${editing.ja} を更新しました`)
      setEditing(null)
    } catch (error) {
      console.error('タグの更新に失敗しました', error)
      setMessage('タグの更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deleting the document alone is what leaves a work pointing at nothing —
   * twelve of them already do, from tags removed before this screen existed.
   * So the references go first, and the tag itself last.
   */
  const remove = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      const reference = doc(db, 'versions/1/tags', deleting.id)

      const animes = await getDocs(collection(db, 'versions/1/animes'))
      const carrying = animes.docs.filter(anime =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (anime.get('tags') ?? []).some((ref: any) => ref.id === deleting.id)
      )
      await Promise.all(carrying.map(anime => updateDoc(anime.ref, { tags: arrayRemove(reference) })))

      // Other tags name this one in their supersede rules; those go too.
      const mentioning = tags.filter(
        tag => tag.narrower.includes(deleting.ja) || tag.excludedBy.includes(deleting.ja)
      )
      await Promise.all(
        mentioning.map(tag =>
          setDoc(
            doc(db, 'versions/1/tags', tag.id),
            {
              narrower: tag.narrower.filter(name => name !== deleting.ja),
              excludedBy: tag.excludedBy.filter(name => name !== deleting.ja),
            },
            { merge: true }
          )
        )
      )

      await deleteDoc(reference)

      setTags(previous =>
        previous
          .filter(tag => tag.id !== deleting.id)
          .map(tag => ({
            ...tag,
            narrower: tag.narrower.filter(name => name !== deleting.ja),
            excludedBy: tag.excludedBy.filter(name => name !== deleting.ja),
          }))
      )
      setMessage(
        `${deleting.ja} を削除しました（${carrying.length}作品から外し、${mentioning.length}件のタグの参照を整理）`
      )
      setDeleting(null)
      setEditing(null)
    } catch (error) {
      console.error('タグの削除に失敗しました', error)
      setMessage('タグの削除に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const names = useMemo(() => tags.map(tag => tag.ja).sort(), [tags])

  return (
    <Card sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        タグ
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        判定基準は自動タグ付けがそのまま読みます。ここを直すと次回の付与から変わります。
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="検索（名前・英語名・判定基準）"
          value={query}
          onChange={event => setQuery(event.target.value)}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          size="small"
          label="群"
          value={group}
          onChange={event => setGroup(event.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">すべて</MenuItem>
          {GROUPS.map(entry => (
            <MenuItem key={entry.key} value={entry.key}>
              {entry.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}

      {loading ? (
        <Stack spacing={1}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} variant="rectangular" height={56} />
          ))}
        </Stack>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary">
            {visible.length} / {tags.length} 件
          </Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {visible.map(tag => (
              <Box
                key={tag.id}
                onClick={() => setEditing({ ...tag })}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  borderRadius: 1,
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
              >
                <Chip size="small" label={labelOf(tag.group)} sx={{ minWidth: 88 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {tag.ja}
                    {tag.aliasOf && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}
                        （{tag.aliasOf} と同義）
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tag.criteria || '判定基準なし'}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {tag.used}作品
                </Typography>
              </Box>
            ))}
            {!visible.length && (
              <Typography variant="body2" sx={{ py: 3, textAlign: 'center' }}>
                該当するタグがありません
              </Typography>
            )}
          </Stack>
        </>
      )}

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>タグを編集</DialogTitle>
        <DialogContent>
          {editing && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="名前"
                value={editing.ja}
                onChange={event => setEditing({ ...editing, ja: event.target.value })}
                fullWidth
              />
              <TextField
                label="英語名"
                value={editing.en}
                onChange={event => setEditing({ ...editing, en: event.target.value })}
                fullWidth
              />
              <TextField
                select
                label="群"
                value={editing.group}
                onChange={event => setEditing({ ...editing, group: event.target.value })}
                fullWidth
              >
                {GROUPS.map(entry => (
                  <MenuItem key={entry.key} value={entry.key}>
                    {entry.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="判定基準"
                value={editing.criteria}
                onChange={event => setEditing({ ...editing, criteria: event.target.value })}
                helperText="このタグを付ける条件。自動タグ付けがこの文をそのまま読みます"
                multiline
                minRows={2}
                fullWidth
              />
              <TextField
                select
                label="より具体的なタグ"
                value={editing.narrower}
                onChange={event =>
                  setEditing({
                    ...editing,
                    narrower:
                      typeof event.target.value === 'string'
                        ? event.target.value.split(',')
                        : (event.target.value as unknown as string[]),
                  })
                }
                slotProps={{ select: { multiple: true } }}
                helperText="ここに挙げたタグが付いたとき、このタグは外れます"
                fullWidth
              >
                {names
                  .filter(name => name !== editing.ja)
                  .map(name => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))}
              </TextField>
              <Typography variant="caption" color="text.secondary">
                {editing.used}作品で使用中
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={() => setDeleting(editing)} sx={{ mr: 'auto' }}>
            削除
          </Button>
          <Button onClick={() => setEditing(null)}>やめる</Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? <CircularProgress size={22} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} fullWidth maxWidth="xs">
        <DialogTitle>タグを削除</DialogTitle>
        <DialogContent>
          {deleting && (
            <Stack spacing={1}>
              <Typography variant="body2">
                「{deleting.ja}」を削除します。
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {deleting.used}作品からこのタグを外し、他のタグの「より具体的なタグ」の
                指定からも取り除きます。作品そのものは消えません。
              </Typography>
              <Typography variant="caption" color="text.secondary">
                元に戻せません。
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>やめる</Button>
          <Button color="error" variant="contained" onClick={remove} disabled={saving}>
            {saving ? <CircularProgress size={22} /> : '削除する'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default Tags
