import type { Metadata } from 'next'
import Link from 'next/link'
import { Box, Container, Stack, Typography } from '@mui/material'
import { api } from '@/Routes/routs'
import { SITE_NAME } from '@/lib/site'
import { courLabel } from '@/utils/cour'

export const dynamic = 'force-static'

const title = '異世界アニメ作品一覧'
const description =
  '掲載している異世界アニメを放送クール順にすべて掲載。各作品ページで期ごとの評価と感想が読めます。'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/animes/' },
  openGraph: { title: `${title} | ${SITE_NAME}`, description, url: '/animes/' },
}

type Anime = { id: string; name: { ja: string }; cours: string[] }

/**
 * Every work, as links.
 *
 * The list on the top page is fetched twenty at a time and rendered in the
 * browser, so its HTML contains no links at all: a crawler arriving at the
 * site could reach a work page only through the sitemap, and a link in a
 * sitemap carries none of the weight of a link on a page.
 */
export default async function AnimeIndex() {
  const response = await fetch(`${api.animes}/statics`)
  if (!response.ok) throw new Error(`Failed to fetch animes: ${response.status}`)
  const animes: Anime[] = await response.json()

  const byCour = new Map<string, Anime[]>()
  for (const anime of animes) {
    // Filed under the cour it last aired in, so a long running series appears
    // once rather than in every quarter it ever touched.
    const cours = [...(anime.cours ?? [])].sort()
    const latest = cours[cours.length - 1] ?? '不明'
    byCour.set(latest, [...(byCour.get(latest) ?? []), anime])
  }

  const groups = [...byCour.entries()].sort(([a], [b]) => (a < b ? 1 : -1))

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h1" sx={{ fontSize: '24px', fontWeight: 'bold', mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ mb: 3 }}>
        {description}（全{animes.length}作品）
      </Typography>

      <Stack spacing={3}>
        {groups.map(([cour, works]) => (
          <Box key={cour} component="section">
            <Typography variant="h2" sx={{ fontSize: '18px', fontWeight: 'bold', mb: 1 }}>
              {courLabel(cour) ?? cour}
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', pl: 0, m: 0 }}>
              {works.map(anime => (
                <li key={anime.id}>
                  <Link href={`/animes/${anime.id}/`} style={{ textDecoration: 'none' }}>
                    <Typography variant="body2" component="span" color="primary">
                      {anime.name.ja}
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
