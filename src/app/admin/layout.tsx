import AdminGuard from "@/Component/AdminGurd";

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