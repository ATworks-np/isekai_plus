import 'server-only'

/** Catalogue writes are rare; a week is enough between them and a restart. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * One value, kept for a while, shared by every request on this process.
 *
 * The catalogue is 155 works. Reading it from Firestore on every list click,
 * carousel slide and tag paint is what ran the bill up. A write invalidates
 * so the instance that took it is immediately correct; other instances keep
 * serving the previous copy until the TTL, which is the same trade the
 * season index already made.
 *
 * Concurrent misses share one load. Without that, the three requests the
 * home page fires at once would each rebuild the same 350 documents.
 */
export const ttlCache = <T>(ttlMs: number) => {
  let value: T | undefined
  let at = 0
  let inflight: Promise<T> | null = null

  return {
    get(load: () => Promise<T>): Promise<T> {
      if (value !== undefined && Date.now() - at < ttlMs) return Promise.resolve(value)
      if (inflight) return inflight
      inflight = load()
        .then(next => {
          value = next
          at = Date.now()
          return next
        })
        .finally(() => {
          inflight = null
        })
      return inflight
    },
    invalidate() {
      value = undefined
      at = 0
    },
  }
}
