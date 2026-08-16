const QUARTER_LABELS = {
  ja: ['冬', '春', '夏', '秋'],
  en: ['Winter', 'Spring', 'Summer', 'Fall'],
} as const

/** The cour containing the supplied date, in the key used by Firestore. */
export const currentCourKey = (date = new Date()) =>
  `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`

/** 2023-Q4 -> 2023年秋 / Fall 2023. Returns null for anything that is not a cour. */
export const courLabel = (cour: string, locale = 'ja'): string | null => {
  const match = /^(\d{4})-Q([1-4])$/.exec(cour)
  if (!match) return null
  const season = (locale === 'en' ? QUARTER_LABELS.en : QUARTER_LABELS.ja)[Number(match[2]) - 1]
  return locale === 'en' ? `${season} ${match[1]}` : `${match[1]}年${season}`
}

/**
 * The cours a work aired in, as prose for a page description: the first and
 * last of a long run rather than a list of twelve quarters.
 */
export const courRangeLabel = (cours: string[], locale = 'ja'): string | null => {
  const labels = [...new Set(cours)]
    .sort()
    .map(cour => courLabel(cour, locale))
    .filter(Boolean) as string[]
  if (!labels.length) return null
  if (labels.length <= 2) return labels.join(locale === 'en' ? ' and ' : '・')
  return locale === 'en'
    ? `${labels[0]} to ${labels[labels.length - 1]}`
    : `${labels[0]}〜${labels[labels.length - 1]}`
}
