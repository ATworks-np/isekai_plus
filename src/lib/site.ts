/**
 * Where the site lives, for the absolute URLs that metadata and structured
 * data have to carry. Paths keep their trailing slash because next.config sets
 * trailingSlash, and a canonical that disagrees with the served URL is worse
 * than none at all.
 */
export const SITE_URL = 'https://ani-mato.net'
export const SITE_NAME = 'いせかいぷらす'

export const animeUrl = (id: string) => `${SITE_URL}/animes/${id}/`

export const thumbnailUrl = (id: string) =>
  `https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail/${id}.jpg`
