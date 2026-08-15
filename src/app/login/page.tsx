import type { Metadata } from 'next'
import LoginPage from '@/components/LoginPage'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <LoginPage />
  )
}
