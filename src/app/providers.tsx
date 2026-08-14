'use client'

import { RecoilRoot } from 'recoil'
import {ThemeProvider} from "@mui/material/styles";
import theme from "@/theme/theme";
import {useEffect, useState} from "react";

/**
 * Renders nothing until mounted, which keeps MUI/emotion from producing markup
 * on the server that the client then disagrees with. Dropping the gate needs
 * @mui/material-nextjs's AppRouterCacheProvider first, so the rule is silenced
 * rather than the behaviour changed.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
  useEffect(() => setMounted(true), [])

  if (!mounted) return null
  return (
  <RecoilRoot>
    <ThemeProvider theme={theme}>
      {children}
    </ThemeProvider>
  </RecoilRoot>
);
}
