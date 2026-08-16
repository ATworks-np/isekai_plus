const thumbnailPrefix = 'https://storage.googleapis.com/jp-contents-matome.appspot.com/thumbnail/'

export const getAnimeURL = (anime_id: string): string => {
  // 作品詳細ページのルートに遷移するURL
  return `/animes/${anime_id}`
}

export const getThumbnailURL = (anime_id: string): string => {
  return `${thumbnailPrefix}${anime_id}.webp`
}

/** A 160px-wide WebP used only by compact list rows. */
export const getSmallThumbnailURL = (thumbnailUrl: string): string => {
  return thumbnailUrl.replace(/\.(?:jpe?g|webp)(?=([?#]|$))/i, '-small.webp')
}
