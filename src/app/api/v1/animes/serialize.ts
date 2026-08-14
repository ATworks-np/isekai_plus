import 'server-only'

import { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore'

const THUMBNAIL_PREFIX = `https://storage.googleapis.com/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/thumbnail/`

/**
 * Keeps the write API's response shaped like the existing read API: tags come
 * back as document paths, not raw references.
 *
 * cours is passed in rather than read off the work, which no longer stores it:
 * it is the union of the seasons' and the caller has already read those.
 */
export const serializeAnime = (doc: DocumentSnapshot, cours: string[]) => {
  const data = doc.data() ?? {}
  return {
    id: doc.id,
    name: data.name ?? null,
    cours,
    tags: (data.tags ?? []).map((tag: DocumentReference) => tag.path),
    thumbnailUrl: `${THUMBNAIL_PREFIX}${doc.id}.jpg`,
  }
}
