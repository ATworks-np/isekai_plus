/**
 * The five axes, in the order they are shown. Their names are UI text, so they
 * live in the message files rather than here — a label hardcoded in Japanese
 * cannot be translated for /en.
 */
export const RATING_AXES = ['story', 'character', 'animation', 'worldview', 'message'] as const

export interface IRatings {
  story: number;
  character: number;
  animation: number;
  worldview: number;
  message: number;
}

/**
 * What an axis reads as before anything has been scored. Zero is also the
 * lowest score a reader can give, so wherever this stands for "not answered"
 * — the rating editor — it must not be submitted as though it were a score.
 */
export const baseRatings: IRatings = {
  story: 0,
  character: 0,
  animation: 0,
  worldview: 0,
  message: 0,
}
