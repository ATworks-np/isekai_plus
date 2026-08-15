import type { Metadata } from 'next'
import {Providers} from '@/app/providers'
import LoadingModal from "@/features/LoadingModal";
import CustomSnackbar from "@/features/CostomSnackbar";
import {CssBaseline} from "@mui/material";
import UpperAppBar from "@/components/UpperAppBar";
import EmotionCacheProvider from "@/components/EmotionCacheProvider";
import Fotter from "@/components/Footer";
import {Box} from "@mui/material";
import { SITE_NAME, SITE_URL } from '@/lib/site'

const title = 'いせかいぷらす | 異世界アニメまとめサイト'
const description =
  '異世界アニメ好き必見！おすすめの異世界転生アニメ、異世界冒険作品をジャンル別にまとめています。異世界アニメの最新情報やランキングも掲載！'

export const metadata: Metadata = {
  // Relative URLs in the metadata below resolve against this, and without it
  // Next emits none of the absolute URLs Open Graph and canonical tags need.
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    // Page titles read "作品名 の評価・感想 | いせかいぷらす" without repeating
    // the tagline on every one of the 155 work pages.
    template: `%s | ${SITE_NAME}`,
  },
  description,
  alternates: { canonical: '/' },
  icons: {
    icon: { url: '/logo_tate_512.png', type: 'image/png', sizes: '512x512' },
    apple: { url: '/logo_tate_512.png', type: 'image/png', sizes: '512x512' },
  },
  openGraph: {
    type: 'website',
    title,
    description: 'おすすめの異世界転生アニメ、異世界冒険作品をジャンル別にまとめサイト',
    siteName: SITE_NAME,
    url: SITE_URL,
    locale: 'ja_JP',
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
};

/** Tells search engines the site is what it says it is, and how to search it. */
const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  alternateName: '異世界ぷらす',
  url: SITE_URL,
  description,
  inLanguage: 'ja',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
    <body>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
    />
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
    </body>
    </html>
  );
}
