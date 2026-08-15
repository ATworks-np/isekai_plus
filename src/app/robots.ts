import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

/**
 * Private and utility pages carry a noindex directive in their own metadata.
 * They must remain crawlable for search engines to see that directive.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
