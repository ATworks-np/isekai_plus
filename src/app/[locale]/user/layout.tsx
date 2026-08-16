import type { Metadata } from 'next'
import AuthGuard from "@/components/AuthGurd";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      {children}
    </AuthGuard>
  )};
