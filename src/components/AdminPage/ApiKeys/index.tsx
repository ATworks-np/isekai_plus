'use client'

import React, { useCallback, useEffect, useState } from 'react'
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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { getAuth } from 'firebase/auth'

type ApiKeyRecord = {
  id: string
  name: string
  keyPrefix: string
  createdAt: string | null
  createdBy: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString('ja-JP') : '—'

const ApiKeys: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [creating, setCreating] = useState<boolean>(false)
  const [issuedKey, setIssuedKey] = useState<string>('')
  const [copied, setCopied] = useState<boolean>(false)

  // Always mint a fresh ID token: the one captured at login expires after an
  // hour and the admin page is typically left open far longer than that.
  const authorizedFetch = useCallback(async (input: string, init?: RequestInit) => {
    const currentUser = getAuth().currentUser
    if (!currentUser) throw new Error('ログインが必要です')
    const token = await currentUser.getIdToken()

    const response = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
    return payload
  }, [])

  const loadKeys = useCallback(async () => {
    try {
      const payload = await authorizedFetch('/api/admin/api-keys/')
      setKeys(payload.keys ?? [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    // onAuthStateChanged rather than an immediate call: on a hard reload the
    // Firebase user is not restored yet when this component first mounts.
    const unsubscribe = getAuth().onAuthStateChanged(user => {
      if (user) loadKeys()
      else setLoading(false)
    })
    return () => unsubscribe()
  }, [loadKeys])

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const payload = await authorizedFetch('/api/admin/api-keys/', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      })
      setIssuedKey(payload.key)
      setName('')
      setCopied(false)
      await loadKeys()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string, keyName: string) => {
    setError('')
    try {
      await authorizedFetch(`/api/admin/api-keys/${id}/`, { method: 'DELETE' })
      await loadKeys()
    } catch (e) {
      setError(`「${keyName}」の失効に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(issuedKey)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card sx={{ p: 3, mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        API キー
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        作品追加 API の認証に使います。キーは発行時にしか表示されないので、その場で控えてください。
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <TextField
          label="用途がわかる名前"
          placeholder="例: 一括インポート用"
          size="small"
          value={name}
          onChange={e => setName(e.target.value)}
          fullWidth
        />
        <Button variant="contained" onClick={handleCreate} disabled={creating || !name.trim()}>
          {creating ? <CircularProgress size={22} /> : '発行'}
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress />
        </Box>
      ) : keys.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          まだキーがありません。
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>名前</TableCell>
                <TableCell>キー</TableCell>
                <TableCell>作成</TableCell>
                <TableCell>最終利用</TableCell>
                <TableCell>状態</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map(key => (
                <TableRow key={key.id}>
                  <TableCell>{key.name}</TableCell>
                  <TableCell>
                    <code>{key.keyPrefix}…</code>
                  </TableCell>
                  <TableCell>{formatDate(key.createdAt)}</TableCell>
                  <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                  <TableCell>
                    {key.revokedAt ? (
                      <Chip size="small" label="失効済み" color="default" />
                    ) : (
                      <Chip size="small" label="有効" color="success" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {!key.revokedAt && (
                      <Button size="small" color="error" onClick={() => handleRevoke(key.id, key.name)}>
                        失効
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Dialog open={!!issuedKey} onClose={() => setIssuedKey('')} fullWidth maxWidth="sm">
        <DialogTitle>API キーを発行しました</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            この画面を閉じると二度と表示できません。今すぐ控えてください。
          </Alert>
          <Box
            component="code"
            sx={{
              display: 'block',
              p: 2,
              bgcolor: 'action.hover',
              borderRadius: 1,
              wordBreak: 'break-all',
              fontSize: 14,
            }}
          >
            {issuedKey}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCopy}>{copied ? 'コピーしました' : 'コピー'}</Button>
          <Button variant="contained" onClick={() => setIssuedKey('')}>
            閉じる
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default ApiKeys
