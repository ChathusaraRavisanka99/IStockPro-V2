import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Manrope, Space_Grotesk } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { RouteProgress } from "@/components/ui/route-progress";
import "@/app/globals.css";
import "@/app/theme-dark.css";
import { themeInitScript } from "@/components/ui/theme-toggle";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "IStockPro-v2",
  description: "Phone resale business management",
};

// viewport-fit=cover lets layouts use env(safe-area-inset-*) on notched phones; zoom stays
// enabled for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f7fb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme script sets html.dark before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
        <Toaster position="top-right" toastOptions={{ className: "!bg-white !text-slate-900 dark:!bg-slate-800 dark:!text-slate-100" }} />
      </body>
    </html>
  );
}
