import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { PUBLIC_METADATA_DESCRIPTION } from "@/lib/brand-positioning";

import "./globals.css";

// Keep DB-bound server rendering beside the Singapore Supabase project.
export const preferredRegion = "sin1";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://auditlayermedia.com",
  ),
  title: "AuditLayerMedia — Social media competitive intelligence",
  description: PUBLIC_METADATA_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "AuditLayerMedia",
    title: "AuditLayerMedia — Know what to do next",
    description:
      "Evidence, diagnosis, and a ranked action plan for social growth.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AuditLayerMedia — Know what to do next",
    description:
      "Evidence, diagnosis, and a ranked action plan for social growth.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
