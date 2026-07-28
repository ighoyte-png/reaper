import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Geist_Mono } from "next/font/google";
import { NavigationProgress } from "@/components/nav/navigation-progress";
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
  icons: {
    icon: "/reaper_logo.svg",
    apple: "/reaper_logo.svg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

/** Nonce-based CSP requires per-request rendering. */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const nonce = headerStore.get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={geistMono.variable} suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <DataProvider>
            <ToastProvider>
              <Suspense fallback={null}>
                <NavigationProgress />
              </Suspense>
              {children}
            </ToastProvider>
          </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
