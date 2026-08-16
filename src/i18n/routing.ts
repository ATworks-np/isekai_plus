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
  // The bare paths are the Japanese ones and they are what Google has indexed,
  // so / stays Japanese for everyone. With detection on, a reader whose browser
  // asks for English — or who chose English once and kept the cookie — gets
  // redirected off the canonical URL, which is a strange thing to do to a
  // crawler. Readers choose with the switch in the bar instead.
  localeDetection: false,
})

export type Locale = (typeof routing.locales)[number]
