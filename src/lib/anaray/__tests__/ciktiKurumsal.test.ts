// ÇIKTI KURUMSAL — teslimat (PDF rapor) metninde "AI-tell"/UI-glyph regresyon kalkanı.
// Kullanıcı isteği: müşteriye giden içerik sade + kurumsal olmalı (durum glyph'leri,
// ok'lu başlıklar, üretici markası çıktıya sızmamalı). Grafik lejant işaretçileri
// (◆ karşılaşma, ▬ çizgi stili) bilinçli olarak HARİÇ — standart grafik konvansiyonu.

import { describe, it, expect } from "vitest";
import { raporHTML } from "../rapor";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme, varsayilanMeta } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

describe("Çıktı kurumsal — glyph/AI-tell yok", () => {
  const h = hazirHatlar().find((x) => x.key === "mevcut")!;
  const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
  const isl = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
  const meta = h.veri.meta ?? { ...varsayilanMeta, projeAdi: "T", hatAdi: h.ad };
  const html = raporHTML(meta, cfg, h.veri.rings ?? [], h.veri.arac ?? varsayilanArac, "tr", 5, isl, "", []);

  // Durum/onay/uyarı glyph'leri ve üretici markası ÇIKTIDA olmamalı.
  for (const g of ["✓", "✔", "●", "⚠", "▲", "▼", "🔄", "🖨", "★", "Powered by", "powered by"]) {
    it(`çıktıda '${g}' yok`, () => expect(html.includes(g), `'${g}' sızdı`).toBe(false));
  }
  // Ok'lu (informal) bölüm başlıkları olmamalı — düz başlığa çevrildi.
  it("ok'lu bölüm başlığı yok", () => {
    expect(html).not.toContain("Talep → Gereken Filo");
    expect(html).not.toContain("Sefer ↔ Ters");
    expect(html).toContain("Talep, Gereken Filo ve Doluluk");
    expect(html).toContain("Sefer ve Ters İşletme");
  });
});
