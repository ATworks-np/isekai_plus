'use client'

import Image from 'next/image'
import React from 'react'
import { useTheme } from '@mui/material/styles'
import { useTranslations } from 'next-intl'

const HomeSplash: React.FC = () => {
  const theme = useTheme()
  const site = useTranslations('site')
  const [showSplash, setShowSplash] = React.useState(false)

  React.useEffect(() => {
    if (sessionStorage.getItem('splashShown') === '1') return
    sessionStorage.setItem('splashShown', '1')
    const showTimer = window.setTimeout(() => setShowSplash(true), 0)
    const hideTimer = window.setTimeout(() => setShowSplash(false), 1200)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  if (!showSplash) return null

  return (
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
        alt={site('searchName')}
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
  )
}

export default HomeSplash
