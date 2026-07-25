import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ev dizinindeki başıboş package-lock.json yüzünden Next kök dizini yanlış
  // çıkarıyordu. Kökü bu projeye sabitliyoruz (import.meta.dirname = next.config
  // dosyasının bulunduğu dizin = anaray). Böylece build her ortamda tutarlı.
  turbopack: {
    root: import.meta.dirname,
  },
  // firebase-admin (ve bağımlılıkları: gRPC vb.) sunucu paketine BUNDLE EDİLMEZ;
  // Node'un kendi require'ıyla yüklenir. Bundle edilince Vercel serverless'ta
  // yüklenemeyip route'lar 500 veriyordu.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
