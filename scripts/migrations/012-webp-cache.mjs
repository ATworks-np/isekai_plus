#!/usr/bin/env node
/**
 * Refreshes WebP thumbnails through the authenticated image API so every
 * object receives the one-year immutable Cache-Control written by the current
 * server implementation.
 *
 *   node scripts/migrations/012-webp-cache.mjs           # dry run
 *   node scripts/migrations/012-webp-cache.mjs --apply   # refresh stale metadata
 */

import { existsSync, readFileSync } from 'fs'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

const apply = process.argv.includes('--apply')
const desiredCache = 'public, max-age=31536000, immutable'

const readEnv = file =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line.includes('='))
      .map(line => {
        const index = line.indexOf('=')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )

const env = readEnv('.env')
const local = existsSync('.env.local') ? readEnv('.env.local') : {}
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const storageBucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
const apiBase = local.ISEKAI_API_BASE
const apiKey = local.ISEKAI_API_KEY

if (!projectId || !storageBucket) throw new Error('Firebase project configuration missing')
if (apply && (!apiBase || !apiKey)) throw new Error('ISEKAI_API_BASE / ISEKAI_API_KEY missing')

initializeApp({ credential: applicationDefault(), projectId, storageBucket })
const bucket = getStorage().bucket()

const endpointFor = name => {
  const series = name.match(/^thumbnail\/([^/]+)\.webp$/i)
  if (series) return `/api/v1/animes/${encodeURIComponent(series[1])}/`
  const season = name.match(/^thumbnail\/([^/]+)\/([^/]+)\.webp$/i)
  if (season) {
    return `/api/v1/animes/${encodeURIComponent(season[1])}/seasons/${encodeURIComponent(season[2])}/`
  }
  throw new Error(`Unexpected thumbnail path: ${name}`)
}

const sourceUrl = name => {
  const jpeg = name.replace(/\.webp$/i, '.jpg')
  return `https://storage.googleapis.com/${storageBucket}/${jpeg
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

const normalizeCache = value => String(value ?? '').replace(/\s+/g, '').toLowerCase()

const refresh = async file => {
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}${endpointFor(file.name)}`, {
        method: 'PATCH',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: sourceUrl(file.name) }),
        signal: AbortSignal.timeout(180_000),
      })
      if (response.status === 404) {
        console.log(`SKIP orphan: ${file.name}`)
        return false
      }
      if (response.ok) return true
      const body = await response.text()
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`${response.status} ${file.name}: ${body}`)
      }
      lastError = new Error(`${response.status} ${file.name}: ${body}`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 1000))
  }
  throw lastError
}

const main = async () => {
  const [files] = await bucket.getFiles({ prefix: 'thumbnail/' })
  const webp = files.filter(file => /\.webp$/i.test(file.name))
  const stale = webp.filter(
    file => normalizeCache(file.metadata.cacheControl) !== normalizeCache(desiredCache)
  )

  console.log(`mode: ${apply ? 'apply' : 'dry-run'}`)
  console.log(`WebP ${webp.length}枚 / 長期キャッシュ未設定 ${stale.length}枚`)
  if (!apply) {
    console.log('nothing written (pass --apply to write)')
    return
  }

  let refreshed = 0
  let skipped = 0
  for (let offset = 0; offset < stale.length; offset += 4) {
    const batch = stale.slice(offset, offset + 4)
    const results = await Promise.all(
      batch.map(refresh)
    )
    refreshed += results.filter(Boolean).length
    skipped += results.filter(result => !result).length
    console.log(`${offset + batch.length}/${stale.length}`)
  }
  console.log(`長期キャッシュ更新 ${refreshed}枚 / 孤立ファイル ${skipped}枚`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
