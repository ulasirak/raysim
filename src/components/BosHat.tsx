"use client";

// raysim — BOŞ HAT durumu.
// Yeni bir hesap (veya yeni açılan hat) sıfırdan başlar: ring yoktur, dolayısıyla
// simülasyon/kapasite/belge modüllerinin hesaplayacağı bir şey de yoktur. Sahte
// bir örnek hat göstermek yerine kullanıcıyı hattı kurmaya yönlendiririz.

import Link from "next/link";
import { brand } from "@/lib/anaray/brand";

const ADIMLAR = [
  ["1", "Ringler", "/ringler", "Durak arası hücreleri (mesafe, dwell, makas, hemzemin) ekleyin — hattın omurgası."],
  ["2", "Sistem Merkezi", "/sistem", "Hız, ivme, headway ve zamanlayıcı parametrelerini projenize göre girin."],
] as const;

export function BosHat({ modul }: { modul: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <div className="rounded-lg border bg-white p-8" style={{ borderColor: brand.border }}>
        <div className="field-label">Hat henüz boş</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>
          {modul} için önce hattınızı tanımlayın
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: brand.muted }}>
          Bu hesapta kayıtlı bir durak/ring bulunmuyor. RaySim hazır bir örnek hat varsaymaz —
          sonuçların sizin projenize ait olması için verileri siz girersiniz.
        </p>

        <ol className="mt-6 flex flex-col gap-3">
          {ADIMLAR.map(([no, ad, href, aciklama]) => (
            <li key={href} className="flex gap-3 rounded-md border px-4 py-3" style={{ borderColor: brand.border }}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: brand.ink }}>{no}</span>
              <div className="min-w-0">
                <Link href={href} className="text-sm font-semibold underline" style={{ color: brand.red }}>{ad}</Link>
                <p className="text-xs leading-relaxed" style={{ color: brand.muted }}>{aciklama}</p>
              </div>
            </li>
          ))}
        </ol>

        <Link href="/ringler"
          className="mt-6 inline-block rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: brand.red }}>
          İlk ringi eklemeye başla →
        </Link>
      </div>
    </div>
  );
}
