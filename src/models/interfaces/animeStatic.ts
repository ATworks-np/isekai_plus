export interface IAnimeStatic {
  id: string,
  name: {
    ja: string,
    en?: string,
  },
  cours: string[],
  ratingCount?: number,
  rating?: number,
  tags: string[],
}
