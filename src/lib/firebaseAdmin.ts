import 'server-only'

import { App, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getAuth, Auth } from 'firebase-admin/auth'

// App Hosting injects FIREBASE_CONFIG and application default credentials, so
// initializeApp needs no arguments there. The explicit projectId/storageBucket
// keep local runs working from the same .env the client SDK reads, provided the
// machine has ADC (gcloud auth application-default login).
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

const adminApp = (): App => getApps()[0] ?? initializeApp({ projectId, storageBucket })

export const adminDb = (): Firestore => getFirestore(adminApp())
export const adminAuth = (): Auth => getAuth(adminApp())
export const adminBucket = () => getStorage(adminApp()).bucket(storageBucket)

export const VERSION_ROOT = 'versions/1'
export const ANIMES_PATH = `${VERSION_ROOT}/animes`
export const TAGS_PATH = `${VERSION_ROOT}/tags`
export const USERS_PATH = `${VERSION_ROOT}/users`
export const API_KEYS_PATH = `${VERSION_ROOT}/apiKeys`
