import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

export default createMiddleware(routing)

export const config = {
  /**
   * Everything except the API, the crawler files and static assets.
   *
   * The API is not localised — it returns data, and the caller says which
   * language it wants with ?lang. robots.txt and sitemap.xml are single files
   * whatever the reader's language, and putting them behind the locale
   * middleware would redirect the crawler that asks for them.
   */
  matcher: ['/((?!api|_next|robots.txt|sitemap.xml|favicon.ico|.*\\..*).*)'],
}
