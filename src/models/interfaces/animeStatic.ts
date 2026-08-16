import type { IRatings } from '@/models/interfaces/ratings'

export interface IAnimeStatic {
  id: string,
  name: {
    ja: string,
    en?: string,
  },
  cours: string[],
  ratingCount?: number,
  rating?: number,
  ratings?: IRatings,
  tags: string[],
  thumbnailUrl?: string,
}
