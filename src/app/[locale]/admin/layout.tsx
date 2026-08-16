import type { Metadata } from 'next'
import AdminGuard from "@/components/AdminGurd";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AdminGuard>
      {children}
    </AdminGuard>
  )};
