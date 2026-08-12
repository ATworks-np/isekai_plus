import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { authenticateAdmin, toApiKeyRecord } from '@/lib/apiKey'
import { API_KEYS_PATH, adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * Revokes rather than deletes, so a key that shows up in logs later can still be
 * traced back to who created it and when it was last used.
 */
export async function DELETE(request: Request, context: Context) {
  const auth = await authenticateAdmin(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params

  try {
    const ref = adminDb().doc(`${API_KEYS_PATH}/${id}`)
    const doc = await ref.get()
    if (!doc.exists) return NextResponse.json({ error: `No API key with id ${id}.` }, { status: 404 })
    if (doc.get('revokedAt')) return NextResponse.json(toApiKeyRecord(doc))

    await ref.update({ revokedAt: FieldValue.serverTimestamp() })
    return NextResponse.json(toApiKeyRecord(await ref.get()))
  } catch (error) {
    console.error(`DELETE /api/admin/api-keys/${id} failed`, error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
