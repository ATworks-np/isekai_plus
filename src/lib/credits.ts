import 'server-only'

import { DocumentSnapshot } from 'firebase-admin/firestore'
import { InvalidInput } from '@/lib/anime'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'

/**
 * Who made a work and who is in it.
 *
 * Kept in a subcollection rather than on the work itself: a cast list runs to
 * thirty entries and the work document is read twenty at a time by the list,
 * which has no use for any of it.
 *
 * One document per work, not per season. Staff and cast do change between
 * seasons — a sequel often changes studio — and the source has them per
 * broadcast, so this records the most recent and says which record it came
 * from rather than pretending the credits are timeless.
 */
export type StaffEntry = { role: string; name: string }
export type CastEntry = { character: string; name: string }
export type ThemeSong = { type: string; title: string; artist: string }

export type Credits = {
  studios: string[]
  staff: StaffEntry[]
  cast: CastEntry[]
  themeSongs: ThemeSong[]
  source: string | null
  sourceWorkTagId: number | null
}

/** The languages the site stores long text in. */
export const LOCALES = ['ja', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/**
 * One document per language.
 *
 * Staff and cast run to fifty entries and are read only by the work page, so
 * they sit in a subcollection keyed by language rather than as a map of
 * languages inside one document: adding English should not enlarge what a
 * Japanese reader downloads.
 */
export const creditsDoc = (animeId: string, locale: Locale = 'ja') =>
  adminDb().doc(`${ANIMES_PATH}/${animeId}/details/${locale}`)

const asTrimmed = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InvalidInput(`${field} must be a non-empty string.`)
  }
  return value.trim()
}

const asOptional = (value: unknown, field: string): string => {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new InvalidInput(`${field} must be a string.`)
  return value.trim()
}

const asArray = (value: unknown, field: string): unknown[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new InvalidInput(`${field} must be an array.`)
  return value
}

/** The whole record is replaced on write; a partial credit list is a wrong one. */
export const buildCreditsWrite = (input: Record<string, unknown>): Credits => ({
  studios: asArray(input.studios, 'studios').map((entry, i) =>
    asTrimmed(entry, `studios[${i}]`)
  ),
  staff: asArray(input.staff, 'staff').map((entry, i) => {
    const item = (entry ?? {}) as Record<string, unknown>
    return {
      role: asTrimmed(item.role, `staff[${i}].role`),
      name: asTrimmed(item.name, `staff[${i}].name`),
    }
  }),
  cast: asArray(input.cast, 'cast').map((entry, i) => {
    const item = (entry ?? {}) as Record<string, unknown>
    return {
      // A minor role is sometimes credited with an actor and no character.
      character: asOptional(item.character, `cast[${i}].character`),
      name: asTrimmed(item.name, `cast[${i}].name`),
    }
  }),
  themeSongs: asArray(input.themeSongs, 'themeSongs').map((entry, i) => {
    const item = (entry ?? {}) as Record<string, unknown>
    return {
      type: asTrimmed(item.type, `themeSongs[${i}].type`),
      title: asOptional(item.title, `themeSongs[${i}].title`),
      artist: asOptional(item.artist, `themeSongs[${i}].artist`),
    }
  }),
  source: input.source === undefined ? null : asOptional(input.source, 'source') || null,
  sourceWorkTagId:
    input.sourceWorkTagId === undefined || input.sourceWorkTagId === null
      ? null
      : Number(input.sourceWorkTagId),
})

export const serializeCredits = (doc: DocumentSnapshot): Credits => {
  const data = doc.data() ?? {}
  return {
    studios: data.studios ?? [],
    staff: data.staff ?? [],
    cast: data.cast ?? [],
    themeSongs: data.themeSongs ?? [],
    source: data.source ?? null,
    sourceWorkTagId: data.sourceWorkTagId ?? null,
  }
}

export const EMPTY_CREDITS: Credits = {
  studios: [],
  staff: [],
  cast: [],
  themeSongs: [],
  source: null,
  sourceWorkTagId: null,
}
