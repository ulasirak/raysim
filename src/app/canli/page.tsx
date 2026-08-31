import { CanliAgSayfa } from "@/components/canliAg";

// /canli?hat=<key> (veya ?proje=<id>) — QR'dan gelen oturumsuz ziyaretçi için sade,
// mobil-uyumlu tam ekran CANLI AĞ SİMÜLASYONU. Ters işletme kapalı gelir; hız/oynat/mod
// butonları + tren üstü işaret açıklaması sayfada. Uygulama kabuğu (nav) gizlenir (AppShell çıplak).
export default function CanliPage() {
  return <CanliAgSayfa />;
}
