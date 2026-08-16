/**
 * The read API. Reads used to come from Cloud Functions, which meant every
 * schema change had to be made twice — dropping cours from the work document
 * needed the same repair in both places. They are Next route handlers now.
 *
 * Absolute at build time because generateStaticParams runs with no server of
 * its own to ask, and relative in the browser so a local server talks to
 * itself rather than to production.
 */
const origin =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ??
  (typeof window === 'undefined' ? 'https://ani-mato.net' : '')

export const api = {
  animes: `${origin}/api/v1/animes`,
  tags: `${origin}/api/v1/tags`,
  // The read caches these functions keep are cleared from the admin screen.
  legacyAnimes: 'https://animes-mu4s3uqxga-uc.a.run.app',
}

/**
 * Reads a build-time endpoint, falling back to the Cloud Function.
 *
 * generateStaticParams and the sitemap run during the build and ask the
 * deployed site, which is the previous release — so the first deploy carrying
 * a new route handler cannot use it yet. The fallback covers exactly that one
 * build; once this release is live the route answers and the legacy path is
 * never taken. Delete it after the Functions are retired.
 */
export const fetchRead = async (path: string, legacyPath = path, init?: RequestInit) => {
  const response = await fetch(`${api.animes}${path}`, init).catch(() => null)
  if (response?.ok) return response
  return fetch(`${api.legacyAnimes}${legacyPath}`, init)
}