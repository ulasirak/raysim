"use client";

// raysim — BELİRLEYİCİ KISIT KARŞILAŞTIRMASI: min headway'i (hMin) oluşturan rakip
// headway kısıtları (blok / terminal / tek-hat / kavşak / sinyal) yan yana çubukla.
// EN YÜKSEK olan hattı BAĞLAR (hMin = max). Hangi kısıtın kapasiteyi sınırladığını —
// ve diğerlerinin ne kadar geride olduğunu (ne kadar pay var) — bir bakışta gösterir.
// Tramvaya özgü: terminal turnback (makas geometrisi) çoğu tramvay hattında bağlayandır.

import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

interface Kisit { anahtar: string; ad: string; headway: number; aktif: boolean }

export function KisitKarsilastirma({ kisitlar, kritikRenk = CK.red }: { kisitlar: Kisit[]; kritikRenk?: string }) {
  const veri = kisitlar.filter((k) => k.headway > 0).sort((a, b) => b.headway - a.headway);
  if (veri.length < 1) return null;
  const maxH = veri[0].headway;
  const bag = veri.find((k) => k.aktif) ?? veri[0];
  const kisaAd: Record<string, string> = { blok: "Blok (Sperrzeit)", terminal: "Terminal (turnback)", tekhat: "Tek hat", kavsak: "Kavşak", sinyal: "Sinyal" };

  return (
    <div>
      <div className="space-y-1.5">
        {veri.map((k) => {
          const yuzde = (k.headway / maxH) * 100;
          const renk = k.aktif ? kritikRenk : CK.blue;
          return (
            <div key={k.anahtar} className="flex items-center gap-2 text-xs">
              <div className="w-32 shrink-0 text-right" style={{ color: k.aktif ? kritikRenk : brand.inkSoft, fontWeight: k.aktif ? 700 : 400 }}>
                {kisaAd[k.anahtar] || k.ad}
              </div>
              <div className="relative h-4 flex-1 overflow-hidden rounded" style={{ background: CK.track }}>
                <div className="h-full rounded" style={{ width: `${yuzde}%`, background: renk, opacity: k.aktif ? 1 : 0.55 }} />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 tabular-nums" style={{ fontSize: 10, color: yuzde > 82 ? "#fff" : brand.inkSoft, fontWeight: k.aktif ? 700 : 500 }}>
                  {Math.round(k.headway)} s
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs" style={{ color: brand.muted }}>
        <b style={{ color: kritikRenk }}>Belirleyici kısıt: {kisaAd[bag.anahtar] || bag.ad}</b> — en yüksek headway ({Math.round(bag.headway)} s) hattı bağlar (hMin). Diğerleri daha küçük headway ister; aradaki fark, o kısıtta ne kadar pay olduğunu gösterir. Bir kısıt iyileştirilirse (ör. terminal makası artırılırsa) sıradaki bağlar.
      </div>
    </div>
  );
}
