import type { Season } from '@/hooks/useSeasons'
import type { IRatings } from '@/models/interfaces/ratings'

export const SORT_OPTIONS = ['recent', 'likes', 'comments', 'rating'] as const

export type SortKey = (typeof SORT_OPTIONS)[number]

export type AnimeListEntry = {
  id: string
  name: { ja: string; en?: string }
  cours: string[]
  tags: string[]
  commentCount: number
  likeCount: number
  latestCour: string | null
  rating: number
  ratings: IRatings
  seasons: Season[]
  thumbnailUrl: string
}

export type AnimeListPage = {
  items: AnimeListEntry[]
  nextCursor: string | null
}
