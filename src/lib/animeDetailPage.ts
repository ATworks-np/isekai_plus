import 'server-only'

import { EMPTY_CREDITS, Credits, Locale, creditsDoc, serializeCredits } from '@/lib/credits'
import { serializeSeasons } from '@/lib/season'
import { seasonIndex, workSeasons } from '@/lib/seasonIndex'

const hasCredits = (credits: Credits) =>
  credits.studios.length > 0 ||
  credits.staff.length > 0 ||
  credits.cast.length > 0 ||
  credits.themeSongs.length > 0

const loadCredits = async (animeId: string, locale: Locale): Promise<Credits> => {
  const localized = await creditsDoc(animeId, locale).get()
  let credits = localized.exists ? serializeCredits(localized) : EMPTY_CREDITS

  // English credits are still being filled in. Names remain useful in
  // Japanese, so keep the same fallback the old browser-side request used.
  if (locale === 'en' && !hasCredits(credits)) {
    const japanese = await creditsDoc(animeId, 'ja').get()
    credits = japanese.exists ? serializeCredits(japanese) : EMPTY_CREDITS
  } else if (locale === 'en' && !credits.summary) {
    const japanese = await creditsDoc(animeId, 'ja').get()
    const summary = japanese.exists ? serializeCredits(japanese).summary : null
    credits = { ...credits, summary }
  }

  return credits
}

/** Public detail data that belongs in the initial HTML, not a client effect. */
export const loadAnimeDetailPage = async (animeId: string, locale: Locale) => {
  const [index, credits] = await Promise.all([seasonIndex(), loadCredits(animeId, locale)])

  return {
    seasons: serializeSeasons(workSeasons(index, animeId).seasons),
    credits,
  }
}
