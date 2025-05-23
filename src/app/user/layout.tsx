import AuthGuard from "@/components/AuthGurd";

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