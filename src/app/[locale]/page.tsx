import ListPage from '@/components/ListPage'
import HomeSplash from '@/components/HomeSplash'
import { loadAnimeListPage } from '@/lib/animeListPage'
import { setRequestLocale } from 'next-intl/server'

export const revalidate = 300

type Props = { params: Promise<{ locale: string }> }

export default async function Home({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  // The first rating-sorted page is part of the response HTML. Crawlers and
  // readers no longer have to wait for a client-side API request before the
  // work names and their detail links exist.
  const initialAnimePage = await loadAnimeListPage({ sort: 'rating' }).catch(error => {
    console.error('Failed to render the initial anime list', error)
    return undefined
  })

  return (
    <>
      <ListPage initialAnimePage={initialAnimePage} />
      <HomeSplash />
    </>
  )
}
