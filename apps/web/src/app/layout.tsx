import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ThemeProvider } from "@/components/theme/theme-provider";
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
    <html
      lang="zh-CN"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <ThemeToggle />
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
