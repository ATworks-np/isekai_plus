import React from 'react'
import AnimeDetailsSection from '@/components/AnimePage/AnimeDetailsSection'
import AnimePageInteractive from '@/components/AnimePage/AnimePageInteractive'
import type { Season } from '@/hooks/useSeasons'
import type { Credits } from '@/lib/credits'
import type { IAnimeStatic } from '@/models/interfaces/animeStatic'

type AnimePageProps = IAnimeStatic & {
  initialSeasons: Season[]
  credits: Credits
}

/**
 * Server boundary for the work page. The public work information is rendered
 * here; only season selection, rating actions and comments enter the client
 * state boundary below.
 */
const AnimePage: React.FC<AnimePageProps> = ({ credits, ...props }) => (
  <AnimePageInteractive
    {...props}
    details={<AnimeDetailsSection credits={credits} />}
  />
)

export default AnimePage
