export const ratingLabels = {
  story: 'ストーリー',
  character: 'キャラ',
  animation: '作画',
  worldview: '世界観',
  message: 'テーマ性'
}

export interface IRatings {
  story: number;
  character: number;
  animation: number;
  worldview: number;
  message: number;
}

export const baseRatings: IRatings = {
  story: 0,
  character: 0,
  animation: 0,
  worldview: 0,
  message: 0,
}