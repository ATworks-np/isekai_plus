#!/usr/bin/env node
/**
 * Creates list-only WebP thumbnails next to every full-size WebP thumbnail.
 *
 *   node scripts/migrations/012-small-thumbnails.mjs           # dry run
 *   node scripts/migrations/012-small-thumbnails.mjs --apply   # writes missing files
 *
 * The output is 160px wide with an automatic height, so the source aspect
 * ratio is preserved. Existing small thumbnails are never overwritten.
 */

import { existsSync, readFileSync } from 'fs'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { GoogleAuth } from 'google-auth-library'
import sharp from 'sharp'

const apply = process.argv.includes('--apply')
const cacheControl = 'public, max-age=31536000, immutable'

const readEnv = file =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line.includes('='))
      .map(line => {
        const separator = line.indexOf('=')
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^["']|["']$/g, ''),
        ]
      })
  )

const env = {
  ...readEnv('.env'),
  ...(existsSync('.env.local') ? readEnv('.env.local') : {}),
}
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const storageBucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

if (!projectId || !storageBucket) {
  throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID / NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET missing')
}

initializeApp({ credential: applicationDefault(), projectId, storageBucket })
const bucket = getStorage().bucket()
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
})
const authClient = await auth.getClient()

const smallName = name => name.replace(/\.webp$/i, '-small.webp')
const formatBytes = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MiB`
const publicUrl = name =>
  `https://storage.googleapis.com/${storageBucket}/${name
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`

const authorizedHeaders = async extra => {
  const accessToken = await authClient.getAccessToken()
  if (!accessToken.token) throw new Error('Could not obtain a Google access token')
  return { Authorization: `Bearer ${accessToken.token}`, ...extra }
}

const upload = async (name, contents) => {
  // The Firebase Storage endpoint also works for Spark-plan buckets, whereas
  // the local GCS media endpoint requires a linked billing account.
  const objectUrl =
    `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(name)}`
  const uploadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o` +
    `?uploadType=media&name=${encodeURIComponent(name)}`
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: await authorizedHeaders({ 'Content-Type': 'image/webp' }),
    body: contents,
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`${response.status} upload ${name}: ${await response.text()}`)

  const metadata = await fetch(objectUrl, {
    method: 'PATCH',
    headers: await authorizedHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ cacheControl }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!metadata.ok) {
    throw new Error(`${metadata.status} metadata ${name}: ${await metadata.text()}`)
  }
}

const main = async () => {
  const [files] = await bucket.getFiles({ prefix: 'thumbnail/' })
  const sources = files.filter(
    file => /\.webp$/i.test(file.name) && !/-small\.webp$/i.test(file.name)
  )
  const existing = new Set(files.map(file => file.name))
  const missing = sources.filter(file => !existing.has(smallName(file.name)))

  console.log(`mode: ${apply ? 'apply' : 'dry-run'}`)
  console.log(`WebP sources: ${sources.length} / small thumbnails missing: ${missing.length}`)

  if (!apply) {
    console.log('nothing written (pass --apply to write)')
    return
  }

  let inputBytes = 0
  let outputBytes = 0
  let converted = 0

  for (let offset = 0; offset < missing.length; offset += 5) {
    const batch = missing.slice(offset, offset + 5)
    const results = await Promise.all(
      batch.map(async source => {
        const response = await fetch(publicUrl(source.name), {
          signal: AbortSignal.timeout(120_000),
        })
        if (!response.ok) throw new Error(`${response.status} download ${source.name}`)
        const input = Buffer.from(await response.arrayBuffer())
        const output = await sharp(input)
          .rotate()
          .resize({ width: 160, withoutEnlargement: true })
          .webp({ quality: 70, effort: 5 })
          .toBuffer()

        await upload(smallName(source.name), output)

        return { input: input.length, output: output.length }
      })
    )

    for (const result of results) {
      inputBytes += result.input
      outputBytes += result.output
      converted += 1
    }
    console.log(`${converted}/${missing.length}`)
  }

  console.log(
    `created ${converted}: ${formatBytes(inputBytes)} -> ${formatBytes(outputBytes)} ` +
      `(${Math.round((1 - outputBytes / inputBytes) * 100)}% smaller)`
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
