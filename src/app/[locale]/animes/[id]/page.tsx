import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import AnimePage from "@/components/AnimePage"
import { fetchRead } from "@/Routes/routs"
import {IAnimeStatic} from "@/models/interfaces/animeStatic";
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SITE_URL, alternatesFor, animeUrl, pageUrl, thumbnailUrl } from '@/lib/site'
import { routing } from '@/i18n/routing'
import { courRangeLabel } from '@/utils/cour'

type Props = {
  params: Promise<{ locale: string; id: string }>
}

export const dynamicParams = false

export async function generateStaticParams() {
  const res = await fetchRead('/ids')

  if (!res.ok) {
    throw new Error('Failed to fetch anime ids')
  }

  const data = await res.json()

  // 期待するレスポンス形式: { ids: ['id1', 'id2', 'id3'] }
  // Every work in every language: the pages are static, so each pair is built.
  return routing.locales.flatMap(locale =>
    data.ids.map((id: string) => ({ locale, id }))
  )
}

/** Fetched twice per page — for the metadata and for the page — but Next dedupes. */
const fetchAnime = async (id: string): Promise<IAnimeStatic> => {
  const res = await fetchRead(`/${id}/`, `/${id}/statics?schema=2`, {
    next: { revalidate: 300 },
  })
  if (res.status === 404) notFound()
  if (!res.ok) throw new Error(`Failed to fetch anime: ${res.status}`)
  return res.json()
}

/** The title as the reader's language writes it, falling back to Japanese. */
const titleOf = (anime: IAnimeStatic, locale: string) =>
  (locale === 'ja' ? anime.name.ja : anime.name.en?.trim() || anime.name.ja) ?? ''

const serializeJsonLd = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params
  const anime = await fetchAnime(id)
  const t = await getTranslations({ locale, namespace: 'work' })
  const site = await getTranslations({ locale, namespace: 'site' })

  const name = titleOf(anime, locale)
  const cours = courRangeLabel(anime.cours, locale)
  const title = t('title', { name })
  const description = t('description', {
    name,
    cours: cours ? t('aired', { cours }) : '',
    site: site('name'),
  })

  return {
    title,
    description,
    alternates: {
      canonical: `${animeUrl(id, locale).replace(SITE_URL, '')}`,
      languages: alternatesFor(`/animes/${id}/`),
    },
    openGraph: {
      type: 'video.tv_show',
      title: `${title} | ${site('name')}`,
      description,
      url: animeUrl(id, locale),
      siteName: site('name'),
      locale: locale === 'ja' ? 'ja_JP' : 'en_US',
      images: { url: thumbnailUrl(id) },
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${site('name')}`,
      description,
      images: [thumbnailUrl(id)],
    },
  }
}

export default async function Page({ params }: Props) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const data = await fetchAnime(id)
  const site = await getTranslations({ locale, namespace: 'site' })
  const nav = await getTranslations({ locale, namespace: 'nav' })

  // A work page is a page about a television series with a score on it, and
  // saying so is what puts the stars in the search result.
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: titleOf(data, locale),
    alternateName: (locale === 'ja' ? data.name.en?.trim() : data.name.ja) || undefined,
    url: animeUrl(id, locale),
    image: thumbnailUrl(id),
    inLanguage: locale,
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
      { '@type': 'ListItem', position: 1, name: site('name'), item: `${pageUrl(locale)}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: nav('allWorks'),
        item: pageUrl(locale, '/animes/'),
      },
      { '@type': 'ListItem', position: 3, name: titleOf(data, locale), item: animeUrl(id, locale) },
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
