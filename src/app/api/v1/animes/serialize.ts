import 'server-only'

import { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore'

const THUMBNAIL_PREFIX = `https://storage.googleapis.com/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/thumbnail/`

/**
 * Keeps the write API's response shaped like the existing read API: tags come
 * back as document paths, not raw references.
 */
export const serializeAnime = (doc: DocumentSnapshot) => {
  const data = doc.data() ?? {}
  return {
    id: doc.id,
    name: data.name ?? null,
    cours: data.cours ?? [],
    tags: (data.tags ?? []).map((tag: DocumentReference) => tag.path),
    thumbnailUrl: `${THUMBNAIL_PREFIX}${doc.id}.jpg`,
  }
}
