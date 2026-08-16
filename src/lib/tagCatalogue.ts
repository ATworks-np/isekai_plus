import 'server-only'

import { TAGS_PATH, adminDb } from '@/lib/firebaseAdmin'
import { WEEK_MS, ttlCache } from '@/lib/ttlCache'
import type { TagCatalogue } from '@/models/tagCatalogue'

const cache = ttlCache<TagCatalogue>(WEEK_MS)

const build = async () => {
  const snapshot = await adminDb().collection(TAGS_PATH).get()
  return Object.fromEntries(
    snapshot.docs.map(doc => [
      doc.ref.path,
      {
        id: doc.id,
        name: doc.get('name') ?? null,
        group: doc.get('group') ?? null,
      },
    ])
  )
}

/** The tag vocabulary, keyed by document path the way a work stores it. */
export const tagCatalogue = () => cache.get(build)

export const invalidateTagCatalogue = () => cache.invalidate()
