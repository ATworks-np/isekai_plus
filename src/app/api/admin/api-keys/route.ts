import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { authenticateAdmin, generateApiKey, toApiKeyRecord } from '@/lib/apiKey'
import { API_KEYS_PATH, adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const snapshot = await adminDb().collection(API_KEYS_PATH).orderBy('createdAt', 'desc').get()
    return NextResponse.json({ keys: snapshot.docs.map(toApiKeyRecord) })
  } catch (error) {
    console.error('GET /api/admin/api-keys failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let name = ''
  try {
    const body = (await request.json()) as { name?: unknown }
    if (typeof body?.name === 'string') name = body.name.trim()
  } catch {
    // An empty body is fine; the key just gets a default label.
  }

  if (!name) return NextResponse.json({ error: 'name is required.' }, { status: 400 })

  try {
    const { key, hash, keyPrefix } = generateApiKey()
    const ref = await adminDb().collection(API_KEYS_PATH).add({
      name,
      hash,
      keyPrefix,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      lastUsedAt: null,
      revokedAt: null,
    })

    // The only time the raw key is ever readable. It is not recoverable later.
    return NextResponse.json({ ...toApiKeyRecord(await ref.get()), key }, { status: 201 })
  } catch (error) {
    console.error('POST /api/admin/api-keys failed', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
