import 'server-only'

import { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { ANIMES_PATH, adminDb } from '@/lib/firebaseAdmin'
import { WEEK_MS, ttlCache } from '@/lib/ttlCache'

export type AnimeCatalogue = {
  docs: QueryDocumentSnapshot[]
  byId: Map<string, QueryDocumentSnapshot>
}

const cache = ttlCache<AnimeCatalogue>(WEEK_MS)

const build = async (): Promise<AnimeCatalogue> => {
  const snapshot = await adminDb().collection(ANIMES_PATH).get()
  return {
    docs: snapshot.docs,
    byId: new Map(snapshot.docs.map(doc => [doc.id, doc])),
  }
}

/** Every work document, for the list, the A-Z index and a single work page. */
export const animeCatalogue = () => cache.get(build)

export const invalidateAnimeCatalogue = () => cache.invalidate()
