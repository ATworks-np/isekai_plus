import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import {Providers} from '@/app/providers'
import LoadingModal from "@/features/LoadingModal";
import CustomSnackbar from "@/features/CostomSnackbar";
import {CssBaseline} from "@mui/material";
import UpperAppBar from "@/components/UpperAppBar";
import EmotionCacheProvider from "@/components/EmotionCacheProvider";
import Fotter from "@/components/Footer";
import {Box} from "@mui/material";
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

/** Japanese has no prefix, so its canonical is the bare path. */
const pathFor = (locale: string) => (locale === routing.defaultLocale ? '' : `/${locale}`)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'site' })
  const title = t('title')
  const description = t('description')

  return {
    // Relative URLs in the metadata below resolve against this, and without it
    // Next emits none of the absolute URLs Open Graph and canonical tags need.
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      // Page titles read "作品名 の評価・感想 | いせかいぷらす" without repeating
      // the tagline on every one of the 155 work pages.
      template: `%s | ${t('name')}`,
    },
    description,
    alternates: {
      canonical: `${pathFor(locale)}/`,
      // Tells Google these are the same page in two languages rather than two
      // pages competing with each other.
      languages: Object.fromEntries(
        routing.locales.map(other => [other, `${pathFor(other)}/`])
      ),
    },
    icons: {
      icon: { url: '/logo_tate_512.png', type: 'image/png', sizes: '512x512' },
      apple: { url: '/logo_tate_512.png', type: 'image/png', sizes: '512x512' },
    },
    openGraph: {
      type: 'website',
      title,
      description: t('tagline'),
      siteName: t('name'),
      url: `${SITE_URL}${pathFor(locale)}/`,
      locale: locale === 'ja' ? 'ja_JP' : 'en_US',
      images: {
        url: '/ogp.png',
        type: 'image/png',
        width: 1200,
        height: 630,
      },
    },
    twitter: {
      title,
      site: '@K6dpNwRnql71264',
      // The Open Graph image is 1200x630, which summary crops to a square thumbnail.
      card: 'summary_large_image',
    },
  }
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  // Without this the page is rendered dynamically, which would cost the 155
  // work pages their static build.
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'site' })

  /** Tells search engines the site is what it says it is. */
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: t('name'),
    alternateName:
      locale === 'ja'
        ? ['異世界ぷらす', 'Isekai Plus']
        : ['いせかいぷらす', '異世界ぷらす'],
    url: SITE_URL,
    description: t('description'),
    inLanguage: locale,
  }

  return (
    <html lang={locale}>
    <body>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
    />
    <NextIntlClientProvider>
      <EmotionCacheProvider>
        <Providers>
          <LoadingModal/>
          <CustomSnackbar/>
          <CssBaseline/>
          <UpperAppBar/>
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Box sx={{ flex: 1 }}>
          {children}
            </Box>
          </Box>
          <Fotter/>
        </Providers>
      </EmotionCacheProvider>
    </NextIntlClientProvider>
    </body>
    </html>
  );
}
