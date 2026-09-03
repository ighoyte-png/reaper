import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { NavigationProgress } from "@/components/nav/navigation-progress";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { VersionRefresh } from "@/components/pwa/version-refresh";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { ToastProvider } from "@/components/toast/toast-provider";
import { DataProvider } from "@/lib/data/store";
import "@fontsource-variable/google-sans/wght.css";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Reaper",
    template: "%s · Reaper",
  },
  description:
    "Reaper - Project Management That Doesn't Get in Your Way.",
  applicationName: "Reaper",
  icons: {
    icon: "/reaper_logo.svg",
    apple: "/reaper_logo.svg",
  },
  appleWebApp: {
    title: "Reaper",
    capable: true,
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistMono.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <DataProvider>
            <ToastProvider>
              <Suspense fallback={null}>
                <NavigationProgress />
              </Suspense>
              <PwaProvider>
                <VersionRefresh />
                {children}
              </PwaProvider>
            </ToastProvider>
          </DataProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
