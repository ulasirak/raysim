"use client";

// raysim — ortak uygulama kabuğu (tek sistem navigasyonu).
// Tüm modüller (Sefer / Ringler / Anklaşman / Kural Kitabı) aynı Masthead + nav
// altında mantıksal olarak bağlıdır. Aktif modül yola (pathname) göre belirlenir;
// Masthead künyesi ve rota buradan beslenir. Sayfalar yalnız içeriklerini döner.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { SimConfigProvider } from "@/components/SimConfigProvider";
import { brand } from "@/lib/anaray/brand";

interface Modul {
  href: string;
  ad: string;
  rol: string;
  kod: string;
  rota: string;
}

const MODULLER: Modul[] = [
  { href: "/", ad: "Sefer Simülasyonu", rol: "Ağ · fizik · headway · kapasite", kod: "SR-0001", rota: "Ana Hat Sefer Analizi" },
  { href: "/ringler", ad: "Durak Arası Ringler", rol: "İşletim hücreleri · worst/best · loop", kod: "SR-0002", rota: "Durak Arası Ring Şartları" },
  { href: "/anklasman", ad: "Makas Bölgesi Anklaşman", rol: "Interlocking · çakışma matriksi · aspekt", kod: "SR-0003", rota: "Makas Bölgesi Anklaşman" },
  { href: "/hat", ad: "Tam Hat Simülasyonu", rol: "Ring + anklaşman · çok tren · darboğaz", kod: "SR-0005", rota: "Tam Hat Çok-Tren Canlı Simülasyon" },
  { href: "/sistem", ad: "Sistem Merkezi", rol: "Parametreler · canlı durum · bilgi", kod: "SR-0004", rota: "Simülasyon Parametreleri & Durum" },
  { href: "/belgeler", ad: "Teknik Belgeler", rol: "Word + Excel · tasarım el kitabı", kod: "SR-0006", rota: "Teknik Dokümantasyon Üretimi" },
];

function aktifModul(pathname: string): Modul {
  if (pathname === "/") return MODULLER[0];
  return MODULLER.find((m) => m.href !== "/" && pathname.startsWith(m.href)) ?? MODULLER[0];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const aktif = aktifModul(pathname);

  return (
    <SimConfigProvider>
      <Masthead belgeKodu={aktif.kod} rota={aktif.rota} />

      {/* Modül navigasyonu — sistemin mantıksal iş akışı (soldan sağa boru hattı) */}
      <nav className="sticky top-0 z-20 border-b" style={{ background: "#0E2739", borderColor: "#1E3A50" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-2">
          {MODULLER.map((m, i) => {
            const on = m.href === aktif.href;
            return (
              <Link key={m.href} href={m.href}
                className="flex shrink-0 flex-col rounded-md px-3 py-1.5 leading-tight transition"
                style={{ background: on ? brand.red : "transparent" }}>
                <span className="text-sm font-medium" style={{ color: on ? "#fff" : "#C7D2DC" }}>
                  {i + 1}. {m.ad}
                </span>
                <span className="text-[0.65rem]" style={{ color: on ? "#ffffffb0" : "#6E8091" }}>{m.rol}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="flex-1" style={{ background: brand.paper }}>{children}</main>

      {/* Global footer — sol: dürüst metodoloji notu · orta: amblem · sağ: künye */}
      <footer className="border-t-2" style={{ background: "#0C2233", borderColor: "#C8102E" }}>
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-5 px-6 py-6 sm:grid-cols-3">
          {/* Sol: OpenTrack ile ilişki — işbirliği/doğrulama beyanı (canlı entegre iddiası YOK) */}
          <div className="text-center text-[0.7rem] leading-relaxed text-slate-400 sm:text-left">
            <span className="text-slate-200">OpenTrack</span> ile işbirliğiyle doğrulanmış;
            blocking-time · Sperrzeitentreppe · UIC 406 metodolojisine dayanan
            <span className="text-slate-200"> bağımsız</span> çekirdek.
          </div>

          {/* Orta: RaySim amblemi */}
          <div className="flex flex-col items-center gap-1.5">
            <svg width="38" height="38" viewBox="0 0 46 46" fill="none" aria-hidden="true">
              <circle cx="23" cy="23" r="21.5" stroke="#A8842C" strokeWidth="1" />
              <circle cx="23" cy="23" r="18" stroke="#E7ECF1" strokeWidth="1" opacity="0.5" />
              <path d="M17 34 L21.5 13 M29 34 L24.5 13" stroke="#E7ECF1" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M18.4 28 L27.6 28 M19.3 24 L26.7 24 M20 20.5 L26 20.5 M20.7 17.5 L25.3 17.5" stroke="#C8102E" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="font-brand text-sm font-semibold tracking-[0.15em] text-white">RaySim</span>
          </div>

          {/* Sağ: künye */}
          <div className="text-center text-[0.7rem] leading-relaxed text-slate-400 sm:text-right">
            Demiryolu Ağı Simülasyon Sistemi
            <br />
            <span className="text-slate-500">Sinyalizasyon · Kapasite · Dokümantasyon</span>
          </div>
        </div>
      </footer>
    </SimConfigProvider>
  );
}
