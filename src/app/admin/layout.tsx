import AdminGuard from "@/components/AdminGurd";

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