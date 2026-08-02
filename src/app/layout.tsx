import type { Metadata } from "next";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

// Canlı alan adı — Vercel'de NEXT_PUBLIC_SITE_URL ayarlanınca paylaşım kartları
// ve mutlak URL'ler doğru üretilir. Ayarlanmazsa localhost'a düşer (zararsız).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RaySim — Demiryolu Ağı Simülasyon Sistemi",
    template: "%s · RaySim",
  },
  description:
    "Demiryolu ağı simülasyon, sinyalizasyon, sefer ve kapasite analizi sistemi — mikroskobik tren hareketi, sabit blok ve UIC 406 kapasite.",
  applicationName: "RaySim",
  keywords: ["demiryolu", "simülasyon", "sinyalizasyon", "kapasite", "tramvay", "RaySim"],
  authors: [{ name: "RaySim" }],
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "RaySim",
    title: "RaySim — Demiryolu Ağı Simülasyon Sistemi",
    description: "Demiryolu ağı simülasyon, sinyalizasyon, sefer ve kapasite analizi sistemi.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "RaySim — Demiryolu Ağı Simülasyon Sistemi",
    description: "Demiryolu ağı simülasyon, sinyalizasyon, sefer ve kapasite analizi sistemi.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} ${spectral.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
