import 'server-only'

import { createHash, randomBytes } from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { API_KEYS_PATH, USERS_PATH, adminAuth, adminDb } from '@/lib/firebaseAdmin'

const KEY_PREFIX = 'isk_'

export type ApiKeyRecord = {
  id: string
  name: string
  keyPrefix: string
  createdAt: string | null
  createdBy: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

/**
 * The raw key is returned to the caller exactly once, at creation. Firestore
 * only ever holds its SHA-256 digest, so a leaked database dump cannot be
 * replayed against the API.
 */
export const generateApiKey = () => {
  const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`
  return { key, hash: hashApiKey(key), keyPrefix: key.slice(0, 12) }
}

export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex')

const toIso = (value: unknown): string | null => {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  return null
}

export const toApiKeyRecord = (
  doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot
): ApiKeyRecord => {
  const data = doc.data() ?? {}
  return {
    id: doc.id,
    name: data.name ?? '',
    keyPrefix: data.keyPrefix ?? '',
    createdAt: toIso(data.createdAt),
    createdBy: data.createdBy ?? null,
    lastUsedAt: toIso(data.lastUsedAt),
    revokedAt: toIso(data.revokedAt),
  }
}

const readApiKeyHeader = (request: Request): string | null => {
  const direct = request.headers.get('x-api-key')
  if (direct) return direct.trim()

  // Accept the bearer form too, but only for values shaped like our keys, so an
  // accidentally forwarded Firebase ID token is rejected rather than hashed.
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const value = auth.slice('Bearer '.length).trim()
    if (value.startsWith(KEY_PREFIX)) return value
  }
  return null
}

export type ApiKeyAuth = { ok: true; keyId: string } | { ok: false; status: number; error: string }

export const authenticateApiKey = async (request: Request): Promise<ApiKeyAuth> => {
  const presented = readApiKeyHeader(request)
  if (!presented) {
    return { ok: false, status: 401, error: 'Missing API key. Send it as the X-API-Key header.' }
  }

  const snapshot = await adminDb()
    .collection(API_KEYS_PATH)
    .where('hash', '==', hashApiKey(presented))
    .limit(1)
    .get()

  if (snapshot.empty) return { ok: false, status: 401, error: 'Invalid API key.' }

  const doc = snapshot.docs[0]
  if (doc.get('revokedAt')) return { ok: false, status: 403, error: 'This API key has been revoked.' }

  // Best effort: a failed usage stamp must not fail an otherwise valid request.
  doc.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {})

  return { ok: true, keyId: doc.id }
}

export type AdminAuth = { ok: true; uid: string } | { ok: false; status: number; error: string }

/**
 * Guards the key-management endpoints. These are called from the admin UI with
 * the signed-in user's Firebase ID token, not with an API key — an API key must
 * never be able to mint more API keys.
 */
export const authenticateAdmin = async (request: Request): Promise<AdminAuth> => {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Firebase ID token.' }
  }

  let uid: string
  try {
    const decoded = await adminAuth().verifyIdToken(auth.slice('Bearer '.length).trim())
    uid = decoded.uid
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired ID token.' }
  }

  const userDoc = await adminDb().doc(`${USERS_PATH}/${uid}`).get()
  if (userDoc.get('type') !== 'admin') {
    return { ok: false, status: 403, error: 'Admin privileges are required.' }
  }

  return { ok: true, uid }
}
