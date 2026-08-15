export const dynamic = 'force-static'

import { MetadataRoute } from 'next'
import { api } from '@/Routes/routs'
import { SITE_URL, animeUrl } from '@/lib/site'

/**
 * Every work page, not just the top page.
 *
 * The list is fetched a page at a time and rendered in the browser, so a
 * crawler that does not scroll sees twenty links and no more. Until the list is
 * server rendered this file is the only complete route into the 155 work pages.
 *
 * No lastModified: the data source does not record a reliable significant
 * content-update time. Google ignores priority and changeFrequency, so the
 * sitemap contains only canonical URLs.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const response = await fetch(`${api.animes}/statics`)
  if (!response.ok) throw new Error(`Failed to fetch animes for sitemap: ${response.status}`)
  const animes: { id: string }[] = await response.json()

  return [
    {
      url: `${SITE_URL}/`,
    },
    {
      url: `${SITE_URL}/animes/`,
    },
    ...animes.map(anime => ({
      url: animeUrl(anime.id),
    })),
  ]
}
