import 'server-only'

import { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { latestCourOf } from '@/lib/anime'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'
import { WEEK_MS, ttlCache } from '@/lib/ttlCache'

export type WorkSeasons = {
  animeId: string
  /** Ordered by the season's own order field, so 第1期 comes first. */
  seasons: QueryDocumentSnapshot[]
  /** Every cour the work aired in, the union of its seasons'. */
  cours: string[]
  latestCour: string | null
}

/**
 * Which cours every work aired in, read from the seasons subcollection.
 *
 * The work used to carry a copy of this — a cours array and a latestCour scalar
 * — because Firestore can neither filter a collection by a subcollection's
 * field nor order by the largest element of an array. The copy had to be
 * rewritten alongside every season change and drifted from it whenever
 * something forgot, so the list orders and filters here instead and the seasons
 * are the only place a cour is written.
 *
 * One query covers every work, which is why it is worth caching: a page of the
 * list needs the whole index to order by broadcast date, not just its own
 * twenty works. The cache is per process, so a second App Hosting instance can
 * serve a stale index for up to the TTL after a write; the API invalidates its
 * own copy so the instance that took the write is immediately correct.
 */
const cache = ttlCache<Map<string, WorkSeasons>>(WEEK_MS)

const build = async () => {
  const snapshot = await adminDb().collectionGroup('seasons').get()
  const index = new Map<string, WorkSeasons>()

  for (const doc of snapshot.docs) {
    const anime = doc.ref.parent.parent
    // collectionGroup matches a subcollection called seasons wherever it is;
    // only the ones directly under the animes collection belong to a work.
    if (!anime || anime.parent.path !== ANIMES_PATH) continue

    const entry = index.get(anime.id) ?? {
      animeId: anime.id,
      seasons: [],
      cours: [],
      latestCour: null,
    }
    entry.seasons.push(doc)
    index.set(anime.id, entry)
  }

  for (const entry of index.values()) {
    entry.seasons.sort((a, b) => (a.get('order') ?? 0) - (b.get('order') ?? 0))
    entry.cours = [
      ...new Set(entry.seasons.flatMap(season => (season.get('cours') ?? []) as string[])),
    ].sort()
    entry.latestCour = latestCourOf(entry.cours)
  }

  return index
}

export const seasonIndex = () => cache.get(build)

/** Called by every write that adds, changes or removes a season. */
export const invalidateSeasonIndex = () => cache.invalidate()

/** A work written since the index was built has no entry yet, not no seasons. */
export const workSeasons = (index: Map<string, WorkSeasons>, animeId: string): WorkSeasons =>
  index.get(animeId) ?? { animeId, seasons: [], cours: [], latestCour: null }
