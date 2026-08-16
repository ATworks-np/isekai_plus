import 'server-only'

import { adminDb, VERSION_ROOT } from '@/lib/firebaseAdmin'

export type LatestNews = {
  id: string
  name: string
}

/** Public headline for the home page. The page ISR caches this result. */
export const loadLatestNews = async (): Promise<LatestNews | null> => {
  const snapshot = await adminDb()
    .collection(`${VERSION_ROOT}/news`)
    .orderBy('created_at', 'desc')
    .limit(1)
    .get()

  const doc = snapshot.docs[0]
  if (!doc) return null
  return { id: doc.id, name: String(doc.get('name') ?? '') }
}
