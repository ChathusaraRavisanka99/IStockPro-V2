import type { Metadata } from "next";
import { Suspense } from "react";
import { Manrope, Space_Grotesk } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { RouteProgress } from "@/components/ui/route-progress";
import "@/app/globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
