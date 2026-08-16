import { createNavigation } from 'next-intl/navigation'
import { routing } from '@/i18n/routing'

/**
 * Link and router that know about the locale prefix, so a link to /animes/
 * stays on /en/animes/ for an English reader without every call site
 * remembering to add it.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
