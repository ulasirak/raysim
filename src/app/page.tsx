import { TekSayfa } from "@/components/TekSayfa";

// Ana sayfa = tek uzun stüdyo: yedi modülün tamamı boru hattı sırasıyla dikey
// akar (bkz. TekSayfa). Eski derin rotalar (/ringler, /anklasman?bolge=… vb.)
// uyumluluk için durur; birincil deneyim burasıdır.
export default function Home() {
  return <TekSayfa />;
}
