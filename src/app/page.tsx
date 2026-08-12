'use client'

import ListPage from '@/components/ListPage'
import React from 'react'
import { useTheme } from '@mui/material/styles'

export default function Home() {
  const theme = useTheme()
  // Show splash only once per browser tab session
  const [showSplash, setShowSplash] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const alreadyShown = sessionStorage.getItem('splashShown') === '1'
    return !alreadyShown
  })

  React.useEffect(() => {
    if (!showSplash) return
    sessionStorage.setItem('splashShown', '1')
    const timer = setTimeout(() => setShowSplash(false), 1200)
    return () => clearTimeout(timer)
  }, [showSplash])

  return (
    <>
      <ListPage />
      {showSplash && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.palette.background.default,
            zIndex: 9999,
          }}
        >
          <img
            src="/logo_tate_512.png"
            alt="logo"
            style={{
              maxWidth: '60vw',
              maxHeight: '60vh',
              width: 'auto',
              height: 'auto',
            }}
          />
        </div>
      )}
    </>
  )
}
