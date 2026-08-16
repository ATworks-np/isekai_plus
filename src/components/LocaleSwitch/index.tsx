'use client'

import React from 'react'
import { Box, IconButton, ListItemText, Menu, MenuItem, Typography } from '@mui/material'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { JapanFlag, UnitedStatesFlag } from '@/components/LocaleSwitch/flags'

/** Flag and endonym: a reader looking for their language looks for its own name. */
const LANGUAGES: Record<string, { Flag: React.FC; name: string }> = {
  ja: { Flag: JapanFlag, name: '日本語' },
  en: { Flag: UnitedStatesFlag, name: 'English' },
}

/**
 * The current language as a flag, the rest behind it.
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
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)

  const current = LANGUAGES[locale]

  const switchTo = (next: string) => {
    setAnchor(null)
    if (next === locale) return
    router.replace(pathname, { locale: next })
  }

  return (
    <>
      <IconButton
        onClick={event => setAnchor(event.currentTarget)}
        aria-label={current?.name ?? locale}
        aria-haspopup="menu"
        size="small"
        sx={{ ml: 0.5 }}
      >
        <Box component="span" sx={{ display: 'flex', lineHeight: 0 }}>
          <current.Flag />
        </Box>
      </IconButton>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {routing.locales.map(entry => {
          const language = LANGUAGES[entry]
          if (!language) return null
          return (
            <MenuItem key={entry} selected={entry === locale} onClick={() => switchTo(entry)}>
              <Box component="span" sx={{ display: 'flex', lineHeight: 0, mr: 1.5 }}>
                <language.Flag />
              </Box>
              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ fontWeight: entry === locale ? 'bold' : 'normal' }}>
                    {language.name}
                  </Typography>
                }
              />
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}

export default LocaleSwitch
