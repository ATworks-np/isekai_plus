'use client'

import { RecoilRoot } from 'recoil'
import {ThemeProvider} from "@mui/material/styles";
import theme from "@/theme/theme";

/**
 * Renders on the server as well as the client. It used to wait for mount,
 * which kept emotion from producing markup the client would disagree with —
 * and cost the site every word of server rendered content. AppRouterCacheProvider
 * flushes emotion's styles into the document instead, so the gate is gone.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
  <RecoilRoot>
    <ThemeProvider theme={theme}>
      {children}
    </ThemeProvider>
  </RecoilRoot>
);
}
