'use client'

import React from 'react'
import { ButtonBase, Menu, MenuItem, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

/**
 * The current language as its code, the rest behind it.
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

  const switchTo = (next: string) => {
    setAnchor(null)
    if (next === locale) return
    router.replace(pathname, { locale: next })
  }

  return (
    <>
      <ButtonBase
        onClick={event => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        sx={{ ml: 0.5, px: 0.75, py: 0.25, borderRadius: 1, gap: 0.25 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {locale}
        </Typography>
        <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
      </ButtonBase>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {routing.locales.map(entry => (
          <MenuItem key={entry} selected={entry === locale} onClick={() => switchTo(entry)} dense>
            <Typography
              variant="body2"
              sx={{ fontWeight: entry === locale ? 'bold' : 'normal' }}
            >
              {entry}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

export default LocaleSwitch
