import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "3GLabVault",
    template: "%s | 3GLabVault",
  },
  description: "实验室知识库与内部邮件协作平台",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "3GLabVault",
    description: "实验室知识库与内部邮件协作平台",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full bg-slate-950 antialiased">
      <body className="flex min-h-full flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
