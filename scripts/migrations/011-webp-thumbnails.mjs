#!/usr/bin/env node
/**
 * Backfills WebP beside every legacy JPEG thumbnail.
 *
 *   node scripts/migrations/011-webp-thumbnails.mjs           # dry run
 *   node scripts/migrations/011-webp-thumbnails.mjs --apply   # writes missing WebP files
 *
 * Existing WebP files are never overwritten and JPEG files are retained as a
 * rollback path for old URLs. Runtime code reads WebP after this migration.
 */

import { existsSync, readFileSync } from 'fs'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

const apply = process.argv.includes('--apply')

const readEnv = file =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line.includes('='))
      .map(line => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )

const env = readEnv('.env')
const local = existsSync('.env.local') ? readEnv('.env.local') : {}
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const storageBucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
const apiBase = local.ISEKAI_API_BASE
const apiKey = local.ISEKAI_API_KEY

if (!projectId || !storageBucket) {
  throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID / NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET missing')
}
if (apply && (!apiBase || !apiKey)) {
  throw new Error('ISEKAI_API_BASE / ISEKAI_API_KEY missing')
}

initializeApp({ credential: applicationDefault(), projectId, storageBucket })
const bucket = getStorage().bucket()

const webpName = name => name.replace(/\.jpe?g$/i, '.webp')
const mb = bytes => `${(bytes / 1024 / 1024).toFixed(2)}MB`

const endpointFor = name => {
  const series = name.match(/^thumbnail\/([^/]+)\.jpe?g$/i)
  if (series) return `/api/v1/animes/${encodeURIComponent(series[1])}/`

  const season = name.match(/^thumbnail\/([^/]+)\/([^/]+)\.jpe?g$/i)
  if (season) {
    return `/api/v1/animes/${encodeURIComponent(season[1])}/seasons/${encodeURIComponent(season[2])}/`
  }

  throw new Error(`Unexpected thumbnail path: ${name}`)
}

const publicUrl = name =>
  `https://storage.googleapis.com/${storageBucket}/${name
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`

const main = async () => {
  const [files] = await bucket.getFiles({ prefix: 'thumbnail/' })
  const jpeg = files.filter(file => /\.jpe?g$/i.test(file.name))
  const existing = new Set(
    files.filter(file => /\.webp$/i.test(file.name)).map(file => file.name)
  )
  const missing = jpeg.filter(file => !existing.has(webpName(file.name)))

  console.log(`mode: ${apply ? 'apply' : 'dry-run'}`)
  console.log(`JPEG ${jpeg.length}枚 / WebP未生成 ${missing.length}枚`)

  if (!apply) {
    console.log('nothing written (pass --apply to write)')
    return
  }

  let sourceBytes = 0
  let outputBytes = 0
  let converted = 0

  // A small batch keeps memory bounded while avoiding 85 serial Storage trips.
  for (let offset = 0; offset < missing.length; offset += 5) {
    const batch = missing.slice(offset, offset + 5)
    const results = await Promise.all(
      batch.map(async source => {
        const imageUrl = publicUrl(source.name)
        const response = await fetch(`${apiBase}${endpointFor(source.name)}`, {
          method: 'PATCH',
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl }),
          signal: AbortSignal.timeout(180_000),
        })
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`${response.status} ${source.name}: ${body}`)
        }

        const webp = await fetch(publicUrl(webpName(source.name)), {
          method: 'HEAD',
          cache: 'no-store',
          signal: AbortSignal.timeout(30_000),
        })
        if (!webp.ok) throw new Error(`WebP verification failed: ${source.name}`)

        return {
          input: Number(source.metadata.size ?? 0),
          output: Number(webp.headers.get('content-length') ?? 0),
        }
      })
    )

    for (const result of results) {
      sourceBytes += result.input
      outputBytes += result.output
      converted += 1
    }
    console.log(`${converted}/${missing.length}`)
  }

  console.log(
    `converted ${converted}枚: ${mb(sourceBytes)} -> ${mb(outputBytes)} ` +
      `(${Math.round((1 - outputBytes / sourceBytes) * 100)}%削減)`
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
