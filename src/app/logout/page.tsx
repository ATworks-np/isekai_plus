import type { Metadata } from 'next'
import LogoutPage from "@/components/LogoutPage";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <LogoutPage />
  )
}
