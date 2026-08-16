import { routing } from '@/i18n/routing'

/**
 * Where the site lives, for the absolute URLs that metadata and structured
 * data have to carry. Paths keep their trailing slash because next.config sets
 * trailingSlash, and a canonical that disagrees with the served URL is worse
 * than none at all.
 */
export const SITE_URL = 'https://ani-mato.net'
export const SITE_NAME = 'いせかいぷらす'

/** Japanese carries no prefix: its pages are already indexed at the bare path. */
export const localePath = (locale: string) =>
  locale === routing.defaultLocale ? '' : `/${locale}`

export const pageUrl = (locale: string, path = '') =>
  `${SITE_URL}${localePath(locale)}${path}`

export const animeUrl = (id: string, locale: string = routing.defaultLocale) =>
  pageUrl(locale, `/animes/${id}/`)

/** The same page in every language, for hreflang. */
export const alternatesFor = (path = '/') =>
  Object.fromEntries(routing.locales.map(locale => [locale, `${localePath(locale)}${path}`]))

export const thumbnailUrl = (id: string) =>
  `https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail/${id}.jpg`
