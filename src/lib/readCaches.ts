import 'server-only'

import { invalidateAnimeCatalogue } from '@/lib/animeCatalogue'
import { invalidateSeasonIndex } from '@/lib/seasonIndex'
import { invalidateTagCatalogue } from '@/lib/tagCatalogue'

/** Every in-process catalogue. The admin screen calls this; writes call the one they dirtied. */
export const invalidateReadCaches = () => {
  invalidateAnimeCatalogue()
  invalidateSeasonIndex()
  invalidateTagCatalogue()
}
