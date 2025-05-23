'use client'

import { CacheProvider } from '@emotion/react'
import { createEmotionCache } from '@/utils/createEmotionCache'
import React from 'react'

const clientSideEmotionCache = createEmotionCache()

export default function EmotionCacheProvider({ children }: { children: React.ReactNode }) {
  return (
    <CacheProvider value={clientSideEmotionCache}>
      {children}
    </CacheProvider>
  )
}
