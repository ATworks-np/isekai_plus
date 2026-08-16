import type { Metadata } from 'next'
import Link from 'next/link'
import { Box, Container, Stack, Typography } from '@mui/material'
import { api } from '@/Routes/routs'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { alternatesFor, localePath } from '@/lib/site'
import { routing } from '@/i18n/routing'
import { courLabel } from '@/utils/cour'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'index' })
  const site = await getTranslations({ locale, namespace: 'site' })
  const path = `${localePath(locale)}/animes/`

  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: path, languages: alternatesFor('/animes/') },
    openGraph: { title: `${t('title')} | ${site('name')}`, description: t('description'), url: path },
  }
}

type Anime = { id: string; name: { ja: string; en?: string }; cours: string[] }

/**
 * Every work, as links.
 *
 * The list on the top page is fetched twenty at a time and rendered in the
 * browser, so its HTML contains no links at all: a crawler arriving at the
 * site could reach a work page only through the sitemap, and a link in a
 * sitemap carries none of the weight of a link on a page.
 */
export default async function AnimeIndex({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'index' })

  const response = await fetch(`${api.animes}/statics`)
  if (!response.ok) throw new Error(`Failed to fetch animes: ${response.status}`)
  const animes: Anime[] = await response.json()

  const byCour = new Map<string, Anime[]>()
  for (const anime of animes) {
    // Filed under the cour it last aired in, so a long running series appears
    // once rather than in every quarter it ever touched.
    const cours = [...(anime.cours ?? [])].sort()
    const latest = cours[cours.length - 1] ?? 'unknown'
    byCour.set(latest, [...(byCour.get(latest) ?? []), anime])
  }

  const groups = [...byCour.entries()].sort(([a], [b]) => (a < b ? 1 : -1))

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h1" sx={{ fontSize: '24px', fontWeight: 'bold', mb: 1 }}>
        {t('title')}
      </Typography>
      <Typography variant="body2" sx={{ mb: 3 }}>
        {t('description')} {t('count', { count: animes.length })}
      </Typography>

      <Stack spacing={3}>
        {groups.map(([cour, works]) => (
          <Box key={cour} component="section">
            <Typography variant="h2" sx={{ fontSize: '18px', fontWeight: 'bold', mb: 1 }}>
              {courLabel(cour, locale) ?? cour}
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', pl: 0, m: 0 }}>
              {works.map(anime => (
                <li key={anime.id}>
                  <Link
                    href={`${localePath(locale)}/animes/${anime.id}/`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Typography variant="body2" component="span" color="primary">
                      {(locale === 'ja' ? anime.name.ja : anime.name.en?.trim() || anime.name.ja)}
                    </Typography>
                  </Link>
                </li>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Container>
  )
}
