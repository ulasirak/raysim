import { TekSayfa } from "@/components/TekSayfa";

// Ana sayfa = tek uzun stüdyo: tüm modüller boru hattı sırasıyla dikey akar
// (bkz. TekSayfa). Eski derin rotalar (/ringler, /sistem vb.) uyumluluk için
// durur; birincil deneyim burasıdır.
export default function Home() {
  return <TekSayfa />;
}
