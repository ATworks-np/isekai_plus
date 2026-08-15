const QUARTER_LABELS = ['冬', '春', '夏', '秋']

/** 2023-Q4 -> 2023年秋. Returns null for anything that is not a cour. */
export const courLabel = (cour: string): string | null => {
  const match = /^(\d{4})-Q([1-4])$/.exec(cour)
  if (!match) return null
  return `${match[1]}年${QUARTER_LABELS[Number(match[2]) - 1]}`
}

/**
 * The cours a work aired in, as prose for a page description: the first and
 * last of a long run rather than a list of twelve quarters.
 */
export const courRangeLabel = (cours: string[]): string | null => {
  const labels = [...new Set(cours)].sort().map(courLabel).filter(Boolean) as string[]
  if (!labels.length) return null
  if (labels.length <= 2) return labels.join('・')
  return `${labels[0]}〜${labels[labels.length - 1]}`
}
