'use client'

import React, { useState } from 'react'
import { Alert, Button, Card, CircularProgress, Stack, Typography } from '@mui/material'
import { getAuth } from 'firebase/auth'

type Result = { name: string; ok: boolean; status: number; error?: string }

const CacheControl: React.FC = () => {
  const [running, setRunning] = useState<boolean>(false)
  const [results, setResults] = useState<Result[]>([])
  const [error, setError] = useState<string>('')

  const handleClear = async () => {
    const currentUser = getAuth().currentUser
    if (!currentUser) {
      setError('ログインが必要です')
      return
    }

    setRunning(true)
    setError('')
    setResults([])
    try {
      const token = await currentUser.getIdToken()
      const response = await fetch('/api/admin/cache/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json().catch(() => ({}))
      setResults(payload.results ?? [])
      if (!response.ok && !payload.results) {
        throw new Error(payload.error ?? `HTTP ${response.status}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card sx={{ p: 3, mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        キャッシュ
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        作品一覧とタグ一覧は読み取り関数がメモリに保持しています。追加や修正が
        一覧に反映されないときに削除してください。
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="center">
        <Button variant="contained" onClick={handleClear} disabled={running}>
          {running ? <CircularProgress size={22} /> : 'キャッシュを削除'}
        </Button>
        {results.map(result => (
          <Typography
            key={result.name}
            variant="body2"
            color={result.ok ? 'success.main' : 'error.main'}
          >
            {result.name}: {result.ok ? '削除しました' : `失敗 (${result.error ?? result.status})`}
          </Typography>
        ))}
      </Stack>
    </Card>
  )
}

export default CacheControl
