'use client'

import React from 'react'
import { Box, ButtonBase, Typography } from '@mui/material'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

const LABELS: Record<string, string> = { ja: '日本語', en: 'EN' }

/**
 * Switches language without leaving the page.
 *
 * usePathname here is next-intl's, which returns the path with the locale
 * prefix already stripped — so /en/animes/xxx comes back as /animes/xxx and
 * can be handed straight to the other locale. Rebuilding it by hand is how a
 * switcher ends up sending an English reader to /en/en/animes/xxx.
 */
const LocaleSwitch: React.FC = () => {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  const switchTo = (next: string) => {
    if (next === locale) return
    // The path already has its ids filled in — usePathname returns the real
    // one, not the [id] pattern — so it is handed over as it stands.
    router.replace(pathname, { locale: next })
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {routing.locales.map((entry, index) => (
        <React.Fragment key={entry}>
          {index > 0 && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              /
            </Typography>
          )}
          <ButtonBase
            onClick={() => switchTo(entry)}
            aria-current={entry === locale ? 'true' : undefined}
            sx={{ px: 0.5, borderRadius: 1 }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: entry === locale ? 'bold' : 'normal',
                color: entry === locale ? 'primary.main' : 'text.secondary',
              }}
            >
              {LABELS[entry] ?? entry}
            </Typography>
          </ButtonBase>
        </React.Fragment>
      ))}
    </Box>
  )
}

export default LocaleSwitch
