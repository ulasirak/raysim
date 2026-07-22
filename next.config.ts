import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ev dizinindeki başıboş package-lock.json yüzünden Next kök dizini yanlış
  // çıkarıyordu. Kökü bu projeye sabitliyoruz (import.meta.dirname = next.config
  // dosyasının bulunduğu dizin = anaray). Böylece build her ortamda tutarlı.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
