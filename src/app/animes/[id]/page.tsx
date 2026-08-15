import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import AnimePage from "@/components/AnimePage"
import { api } from "@/Routes/routs"
import {IAnimeStatic} from "@/models/interfaces/animeStatic";
import { SITE_NAME, SITE_URL, animeUrl, thumbnailUrl } from '@/lib/site'
import { courRangeLabel } from '@/utils/cour'

type Props = {
  params: Promise<{ id: string }>
}

export const dynamicParams = false

export async function generateStaticParams() {
  const res = await fetch(api.animes+'/ids')

  if (!res.ok) {
    throw new Error('Failed to fetch anime ids')
  }

  const data = await res.json()

  // 期待するレスポンス形式: { ids: ['id1', 'id2', 'id3'] }
  return data.ids.map((id: string) => ({
    id,
  }))
}

/** Fetched twice per page — for the metadata and for the page — but Next dedupes. */
const fetchAnime = async (id: string): Promise<IAnimeStatic> => {
  const res = await fetch(api.animes+'/'+id+'/statics?schema=2', {
    next: { revalidate: 300 },
  })
  if (res.status === 404) notFound()
  if (!res.ok) throw new Error(`Failed to fetch anime: ${res.status}`)
  return res.json()
}

const describe = (anime: IAnimeStatic) => {
  const cours = courRangeLabel(anime.cours)
  return `『${anime.name.ja}』の評価と感想。ストーリー・キャラクター・作画・世界観・メッセージ性の5項目で期ごとに採点でき、視聴者のコメントも読めます。${
    cours ? `放送: ${cours}。` : ''
  }異世界アニメまとめサイト${SITE_NAME}。`
}

const serializeJsonLd = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const anime = await fetchAnime(id)
  const description = describe(anime)
  const title = `${anime.name.ja} の評価・感想`

  return {
    title,
    description,
    alternates: { canonical: `/animes/${id}/` },
    openGraph: {
      type: 'video.tv_show',
      title: `${title} | ${SITE_NAME}`,
      description,
      url: animeUrl(id),
      siteName: SITE_NAME,
      locale: 'ja_JP',
      images: { url: thumbnailUrl(id) },
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [thumbnailUrl(id)],
    },
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params

  const data = await fetchAnime(id)

  // A work page is a page about a television series with a score on it, and
  // saying so is what puts the stars in the search result.
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: data.name.ja,
    alternateName: data.name.en?.trim() || undefined,
    url: animeUrl(id),
    image: thumbnailUrl(id),
    inLanguage: 'ja',
    genre: ['異世界', 'アニメ'],
  }

  // Only when someone has actually rated it: an aggregate over no ratings is
  // the kind of thing that gets structured data ignored site wide.
  const ratingCount = data.ratingCount ?? 0
  if (ratingCount > 0 && typeof data.rating === 'number') {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(data.rating.toFixed(2)),
      ratingCount,
      bestRating: 5,
      worstRating: 0,
    }
  }

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '異世界アニメ作品一覧', item: `${SITE_URL}/animes/` },
      { '@type': 'ListItem', position: 3, name: data.name.ja, item: animeUrl(id) },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
      />
      <AnimePage {...data} />
    </>
  )
}
