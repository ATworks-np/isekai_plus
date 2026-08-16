import { defineRouting } from 'next-intl/routing'

/**
 * Japanese keeps the URLs it has.
 *
 * The site's 155 work pages are indexed at /animes/<id>/, and moving them to
 * /ja/animes/<id>/ would ask Google to relearn every one of them for nothing.
 * So the default locale carries no prefix and English sits under /en.
 */
export const routing = defineRouting({
  locales: ['ja', 'en'],
  defaultLocale: 'ja',
  localePrefix: 'as-needed',
})

export type Locale = (typeof routing.locales)[number]
