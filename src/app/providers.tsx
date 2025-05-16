'use client'

import { RecoilRoot } from 'recoil'
import {ThemeProvider} from "@mui/material/styles";
import theme from "@/theme/theme";
import LoadingModal from "@/features/LoadingModal";
import {useEffect, useState} from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
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
