import ListPage from '@/components/ListPage'
import { loadAnimeListPage } from '@/lib/animeListPage'
import { loadLatestNews } from '@/lib/news'
import { tagCatalogue } from '@/lib/tagCatalogue'
import { setRequestLocale } from 'next-intl/server'
import { currentCourKey } from '@/utils/cour'

export const revalidate = 300

type Props = { params: Promise<{ locale: string }> }

export default async function Home({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  // The first rating-sorted page is part of the response HTML. Crawlers and
  // readers no longer have to wait for a client-side API request before the
  // work names and their detail links exist.
  const currentCour = currentCourKey()
  const [initialAnimePage, carouselPage, latestNews, initialTags] = await Promise.all([
    loadAnimeListPage({ sort: 'rating' }).catch(error => {
      console.error('Failed to render the initial anime list', error)
      return undefined
    }),
    loadAnimeListPage({ sort: 'rating', cour: currentCour, limit: 10 }).catch(error => {
      console.error('Failed to render the season carousel', error)
      return undefined
    }),
    loadLatestNews().catch(error => {
      console.error('Failed to render the latest news', error)
      return null
    }),
    tagCatalogue().catch(error => {
      console.error('Failed to render the tag catalogue', error)
      return {}
    }),
  ])

  return <ListPage
    initialAnimePage={initialAnimePage}
    carouselItems={carouselPage?.items ?? []}
    currentCour={currentCour}
    latestNews={latestNews}
    initialTags={initialTags}
  />
}
