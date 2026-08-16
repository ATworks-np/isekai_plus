'use client'

import ListPage from '@/components/ListPage'
import Image from 'next/image'
import React from 'react'
import { useTheme } from '@mui/material/styles'

export default function Home() {
  const theme = useTheme()
  // Show splash only once per browser tab session.
  //
  // Decided after mount rather than while rendering: the page is server
  // rendered now, and a value read from sessionStorage during the first render
  // is one the server could not have produced.
  const [showSplash, setShowSplash] = React.useState<boolean>(false)

  React.useEffect(() => {
    if (sessionStorage.getItem('splashShown') === '1') return
    sessionStorage.setItem('splashShown', '1')
    // Schedule state changes so the effect only coordinates the browser-only
    // session value; it does not synchronously cascade another render.
    const showTimer = window.setTimeout(() => setShowSplash(true), 0)
    const hideTimer = window.setTimeout(() => setShowSplash(false), 1200)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

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
          <Image
            src="/logo_tate_512.png"
            alt="いせかいぷらす"
            width={512}
            height={512}
            priority
            sizes="60vw"
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
