'use client'

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import React from 'react'

/**
 * Emotion's cache, set up so the styles MUI generates on the server reach the
 * HTML instead of only the browser.
 *
 * A plain CacheProvider does not: the styles it collects during a server render
 * are never flushed into the document, which is why the app used to render
 * nothing until it had mounted. That gate meant every page — the list and all
 * 155 work pages — was served with an empty body.
 */
export default function EmotionCacheProvider({ children }: { children: React.ReactNode }) {
  return <AppRouterCacheProvider options={{ key: 'css' }}>{children}</AppRouterCacheProvider>
}
