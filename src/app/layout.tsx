import {Providers} from '@/app/providers'
import LoadingModal from "@/features/LoadingModal";
import CustomSnackbar from "@/features/CostomSnackbar";
import {CssBaseline} from "@mui/material";
import UpperAppBar from "@/components/UpperAppBar";
import EmotionCacheProvider from "@/components/EmotionCacheProvider";
import Fotter from "@/components/Footer";
import {Box} from "@mui/material";
export const metadata = {
  title: "いせかいぷらす | 異世界アニメまとめサイト",
  description: "異世界アニメ好き必見！おすすめの異世界転生アニメ、異世界冒険作品をジャンル別にまとめています。異世界アニメの最新情報やランキングも掲載！",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    title: "いせかいぷらす | 異世界アニメまとめサイト",
    description:
      "おすすめの異世界転生アニメ、異世界冒険作品をジャンル別にまとめサイト",
    siteName: "いせかいぷらす",
    url: "https://ani-mato.net/",
    images: {
      url: "https://jp-contents-matome.firebaseapp.com/ogp.png",
      type: "image/png",
      width: 1200,
      height: 630,
    },
  },
  twitter: {
    title: "いせかいぷらす | 異世界アニメまとめサイト",
    site: "@K6dpNwRnql71264",
    card: "summary",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
    <body
      cz-shortcut-listen="true"
      style={{
        height: "1000px",
      }}
    >
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