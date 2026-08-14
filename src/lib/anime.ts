import 'server-only'

import { lookup } from 'dns/promises'
import { isIP } from 'net'
import sharp from 'sharp'
import { DocumentReference } from 'firebase-admin/firestore'
import { ANIMES_PATH, TAGS_PATH, adminBucket, adminDb } from '@/lib/firebaseAdmin'

export class InvalidInput extends Error {}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type AnimeInput = {
  name?: { ja?: unknown; en?: unknown }
  cours?: unknown
  tags?: unknown
  imageUrl?: unknown
}

export type AnimeWrite = {
  name?: { ja: string; en: string }
  cours?: string[]
  tags?: DocumentReference[]
}

const asString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InvalidInput(`${field} must be a non-empty string.`)
  }
  return value.trim()
}

const parseCours = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new InvalidInput('cours must be an array of strings.')
  return value.map((entry, i) => asString(entry, `cours[${i}]`))
}

/**
 * Tags must already exist. Accepting free-form names here would let every
 * caller mint near-duplicate tags ("異世界転生" vs "異世界転生 "), which is
 * exactly what the admin UI's tag picker exists to prevent.
 */
const resolveTags = async (value: unknown): Promise<DocumentReference[]> => {
  if (!Array.isArray(value)) throw new InvalidInput('tags must be an array of tag ids.')

  const ids = value.map((entry, i) => {
    const raw = asString(entry, `tags[${i}]`)
    // Accept both a bare id and the full document path the read API returns.
    const id = raw.startsWith(`${TAGS_PATH}/`) ? raw.slice(TAGS_PATH.length + 1) : raw
    if (id.includes('/')) throw new InvalidInput(`tags[${i}] is not a valid tag id: ${raw}`)
    return id
  })

  if (ids.length === 0) return []

  const db = adminDb()
  const refs = ids.map(id => db.doc(`${TAGS_PATH}/${id}`))
  const snapshots = await db.getAll(...refs)

  const missing = snapshots.filter(s => !s.exists).map(s => s.id)
  if (missing.length) {
    throw new InvalidInput(`Unknown tag id(s): ${missing.join(', ')}. Create the tag first.`)
  }

  return refs
}

export const buildAnimeWrite = async (body: AnimeInput, { partial }: { partial: boolean }) => {
  const write: AnimeWrite = {}

  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'object' || body.name === null) {
      throw new InvalidInput('name must be an object with ja and en.')
    }
    write.name = {
      ja: asString(body.name.ja, 'name.ja'),
      en: asString(body.name.en, 'name.en'),
    }
  }

  if (body.cours !== undefined) write.cours = parseCours(body.cours)
  else if (!partial) write.cours = []

  if (body.tags !== undefined) write.tags = await resolveTags(body.tags)
  else if (!partial) write.tags = []

  return write
}

const assertPublicUrl = async (raw: string): Promise<URL> => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new InvalidInput('imageUrl is not a valid URL.')
  }

  if (url.protocol !== 'https:') throw new InvalidInput('imageUrl must use https.')

  // The server fetches this URL, so an unchecked host turns the endpoint into an
  // SSRF proxy into the Cloud Run VPC and the GCE metadata server.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const address = isIP(host) ? host : (await lookup(host)).address
  if (isPrivateAddress(address)) {
    throw new InvalidInput('imageUrl must point at a public host.')
  }

  return url
}

const isPrivateAddress = (address: string): boolean => {
  if (isIP(address) === 6) {
    const v6 = address.toLowerCase()
    if (v6 === '::1' || v6 === '::') return true
    if (/^f[cd]/.test(v6)) return true // unique local
    if (/^fe[89ab]/.test(v6)) return true // link local
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }

  const [a, b] = address.split('.').map(Number)
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true // link local, covers GCE metadata
  if (a === 100 && b >= 64 && b <= 127) return true // carrier grade NAT
  return false
}

/**
 * Mirrors what the admin UI does on the client: store the thumbnail as both jpg
 * and webp under thumbnail/<key>, so getThumbnailURL keeps resolving.
 *
 * `key` is the anime id for a series and <animeId>/<seasonId> for a season, so
 * a season's key visual sits beside its series' rather than overwriting it.
 */
export const storeThumbnailFromUrl = async (key: string, rawUrl: unknown) => {
  const url = await assertPublicUrl(asString(rawUrl, 'imageUrl'))

  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    throw new InvalidInput(`Could not fetch imageUrl (HTTP ${response.status}).`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new InvalidInput(`imageUrl did not return an image (content-type: ${contentType || 'unknown'}).`)
  }

  const source = Buffer.from(await response.arrayBuffer())
  if (source.byteLength > MAX_IMAGE_BYTES) {
    throw new InvalidInput(`Image exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024}MB limit.`)
  }

  let jpeg: Buffer
  let webp: Buffer
  try {
    jpeg = await sharp(source).jpeg({ quality: 85 }).toBuffer()
    webp = await sharp(source).webp({ quality: 85 }).toBuffer()
  } catch {
    throw new InvalidInput('imageUrl could not be decoded as an image.')
  }

  const bucket = adminBucket()
  const names = [`thumbnail/${key}.jpg`, `thumbnail/${key}.webp`]
  await Promise.all([
    bucket.file(names[0]).save(jpeg, { contentType: 'image/jpeg', resumable: false }),
    bucket.file(names[1]).save(webp, { contentType: 'image/webp', resumable: false }),
  ])

  // The bucket already grants allUsers object read, so this is belt and braces
  // for buckets without it. Uniform bucket-level access rejects it; ignore that.
  await Promise.all(names.map(name => bucket.file(name).makePublic().catch(() => {})))
}

export const deleteThumbnails = async (key: string) => {
  const bucket = adminBucket()
  await Promise.all(
    [`thumbnail/${key}.jpg`, `thumbnail/${key}.webp`].map(name =>
      bucket.file(name).delete({ ignoreNotFound: true })
    )
  )
}

export const thumbnailUrlFor = (key: string) =>
  `https://storage.googleapis.com/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/thumbnail/${key}.jpg`

export const animeDoc = (id: string) => adminDb().doc(`${ANIMES_PATH}/${id}`)

/**
 * The most recent cour a work aired in, as a sortable scalar.
 *
 * Firestore cannot order by the largest element of an array, and the list sorts
 * newest first by default, so the maximum is stored alongside the array.
 * YYYY-QN compares correctly as a string.
 */
export const latestCourOf = (cours: unknown): string | null => {
  if (!Array.isArray(cours)) return null
  const valid = cours.filter(
    (cour): cour is string => typeof cour === 'string' && /^\d{4}-Q[1-4]$/.test(cour)
  )
  return valid.length ? valid.sort()[valid.length - 1] : null
}
