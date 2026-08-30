"use client";

// raysim — TERS İŞLETME bölümü: kısa dönüş / makas varyasyonları / talep-dönüş / filo.
// Tek depodan çıkan trenlerin makaslardan karşı şeride geçip ters yönde başlaması,
// her makas bölgesinin yolcu yoğunluğuna göre kısa-dönüş (turnback) rolü, hangi
// durakların dönüşe ihtiyaç duyacağı ve pik talebi tıkanmadan karşılayacak filo.

import { useMemo } from "react";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { tersIsletmeAnaliz } from "@/lib/anaray/tersisletme";
import { Num, Panel, SubBaslik } from "@/components/RingUI";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

function Kucuk({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-[0.65rem] leading-snug" style={{ color: brand.muted }}>{children}</span>;
}

const FILO_RENK: Record<string, { bg: string; bd: string; ad: string }> = {
  arttir: { bg: "#FEF2F2", bd: CK.red, ad: "ARAÇ EKLE" },
  azalt: { bg: CK.goodBgSoft, bd: brand.ink, ad: "ARAÇ ÇEK" },
  yeterli: { bg: CK.goodBgSoft, bd: "#16794C", ad: "FİLO YETERLİ" },
  kapasiteYetmez: { bg: "#FEF2F2", bd: CK.red, ad: "KAPASİTE YETMEZ" },
};

export function TersIsletme() {
  const { cfg } = useSimConfig();
  const { rings: ringsHam } = useProje();
  const { arac: stock } = useArac();
  const { isletme, patchIsletme } = useIsletme();
  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);
  const rapor = useMemo(() => tersIsletmeAnaliz(rings, stock, isletme, cfg), [rings, stock, isletme, cfg]);

  if (rings.length < 2 || !rapor) {
    return (
      <div>
        <SubBaslik>Ters İşletme</SubBaslik>
        <p className="mt-2 text-sm" style={{ color: brand.muted }}>Analiz için önce Durak Arası Ringler bölümünde en az iki duraklı bir hat kur.</p>
      </div>
    );
  }

  const f = rapor.filo;
  const renk = FILO_RENK[f.oneri];
  const pct = (x: number) => `%${Math.round(x * 100)}`;

  return (
    <div className="space-y-4">
      <div>
        <SubBaslik>Ters İşletme — Kısa Dönüş, Makas Varyasyonları & Filo</SubBaslik>
        <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>
          Bütün trenler tek depodan çıkar; bazıları ilk makastan karşı şeride geçip ters yönde işe başlar. Her makas bölgesi bir kısa-dönüş noktasıdır. Sistem, yolcu talep dağılımına göre her makasın ters-işletme varyasyonlarını, hangi durakların dönüşe ihtiyaç duyacağını ve pik talebi tıkanmadan karşılayacak filoyu yorumlar.
        </p>
      </div>

      {/* Girdiler */}
      <Panel baslik="Talep & Kapasite Girdileri" aciklama="Talep istasyon rolünden tahmin edilir (aktarma/hastane/stadyum/merkez = yoğun); ring'e gerçek iniş/biniş girilirse otomatik ona döner. Aşağıdakiler analizi ölçekler.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><Num label="Pik saat yolcu" suffix="yolcu/sa" step={100} value={isletme.pikYolcuSaat}
            onChange={(v) => patchIsletme({ pikYolcuSaat: Math.max(0, Math.round(v)) })} /><Kucuk>pik saatte toplam biniş (tek yön talep tabanı)</Kucuk></div>
          <div><Num label="Araç yolcu kapasitesi" suffix="kişi" step={10} value={isletme.aracYolcuKapasite}
            onChange={(v) => patchIsletme({ aracYolcuKapasite: Math.max(1, Math.round(v)) })} /><Kucuk>tıkanmadan taşınan (Škoda 28T ~220 konforlu / 364 crush)</Kucuk></div>
          <div><Num label="Doluluk hedefi" suffix="%" step={5} value={Math.round((isletme.dolulukHedefi || 0.85) * 100)}
            onChange={(v) => patchIsletme({ dolulukHedefi: Math.min(1, Math.max(0.3, v / 100)) })} /><Kucuk>bu oranın üstü "tıkanma" sayılır</Kucuk></div>
        </div>
        <p className="mt-2 text-xs" style={{ color: brand.muted }}>
          {rapor.gercekVeri ? "✓ Talep gerçek iniş/biniş verisinden." : "ℹ️ Talep istasyon rolünden tahmin — ring'e gerçek iniş/biniş girersen otomatik gerçeğe döner."} Çevrim {Math.round(rapor.cevrimSn / 60)} dk · mevcut frekans {rapor.mevcutFrekans.toFixed(1)} tren/saat · araç kapasitesi {rapor.aracKapasite} kişi.
        </p>
      </Panel>

      {/* FİLO ÖNERİSİ — en önemli çıktı */}
      <div className="rounded-lg border-2 p-4" style={{ borderColor: renk.bd, background: renk.bg }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: renk.bd }}>{renk.ad}</span>
          <span className="text-xs" style={{ color: brand.muted }}>pik talebi {pct(isletme.dolulukHedefi || 0.85)} dolulukla</span>
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums" style={{ color: brand.ink }}>{f.gerekenArac}</span>
          <span className="text-sm" style={{ color: brand.inkSoft }}>gereken araç · mevcut pik {f.mevcutPik} · {f.fark > 0 ? `+${f.fark} ekle` : f.fark < 0 ? `${f.fark} çek` : "değişim yok"}</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>{f.aciklama}</p>
        {f.kisaDonusTasarruf > 0 && (
          <p className="mt-1 text-xs" style={{ color: brand.muted }}>Kısa dönüş uygulanırsa dış kolda boş sefer azalır → ~{f.kisaDonusTasarruf} araç tasarruf ({f.gerekenAracKisaDonusle} araç). Sürdürülebilir tavan {rapor.maksSurdurulebilir} tramvay.</p>
        )}
      </div>

      {/* Depo dağılımı */}
      <Panel baslik="Depo Çıkışı — Tek Depodan İki Yön" aciklama="Servis başında tek depodan çıkan trenlerin makaslarla iki yöne dağıtılması.">
        <div className="flex flex-wrap gap-4">
          <div className="rounded border px-3 py-2" style={{ borderColor: brand.border }}><div className="text-xl font-bold tabular-nums" style={{ color: CK.blue }}>{rapor.depoDagilim.gidis}</div><div className="text-xs" style={{ color: brand.muted }}>gidiş yönü (kendi yönünden çıkar)</div></div>
          <div className="rounded border px-3 py-2" style={{ borderColor: brand.border }}><div className="text-xl font-bold tabular-nums" style={{ color: CK.orange }}>{rapor.depoDagilim.donus}</div><div className="text-xs" style={{ color: brand.muted }}>dönüş yönü (ilk makastan karşı şeride geçer)</div></div>
        </div>
        <p className="mt-2 text-xs" style={{ color: brand.muted }}>{rapor.depoDagilim.aciklama}</p>
      </Panel>

      {/* Dönüşe ihtiyaç duyan duraklar */}
      <Panel baslik="Dönüşe İhtiyaç Duyan Duraklar (yolcu birikimi)" aciklama="Tepe yükü arzın üstüne çıkan (tıkanan) duraklar — bu kesimi beslemek için en yakın yukarı makastan kısa dönüş önerilir.">
        {rapor.donusIhtiyaclari.length === 0 ? (
          <p className="text-sm" style={{ color: "#16794C" }}>✓ Hiçbir durak tıkanmıyor — mevcut talep {pct(isletme.dolulukHedefi || 0.85)} doluluk hedefinin altında karşılanıyor.</p>
        ) : (
          <div className="space-y-2">
            {rapor.donusIhtiyaclari.map((d, i) => {
              const sev = d.siddet === "kritik" ? CK.red : d.siddet === "yuksek" ? CK.amber : brand.inkSoft;
              return (
                <div key={i} className="rounded border-l-4 px-3 py-1.5 text-sm" style={{ borderColor: sev, background: "#FBFCFD" }}>
                  <div className="flex items-center justify-between">
                    <b style={{ color: brand.ink }}>{d.durak}</b>
                    <span className="text-xs font-semibold" style={{ color: sev }}>doluluk %{Math.round(d.doluluk * 100)} · {d.siddet.toUpperCase()}</span>
                  </div>
                  <div className="text-xs" style={{ color: brand.muted }}>{d.sebep} → <b>{d.oneriMakas}</b> makasından kısa dönüş bu kesimin sıklığını artırır.</div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Makas-başı ters işletme analizi */}
      <Panel baslik="Makas Bölgesi Başına Ters İşletme Varyasyonları" aciklama="Her makas bölgesinin kısa-dönüş rolü + tüm ters-işletme ihtimalleri; süreler değişmeden yoğunluğa karşı nasıl kullanılır.">
        {rapor.makaslar.length === 0 ? (
          <p className="text-sm" style={{ color: brand.muted }}>Ara istasyonlarda makas bölgesi yok (yalnız uç terminaller dönüş yapıyor).</p>
        ) : (
          <div className="space-y-3">
            {rapor.makaslar.map((m, i) => (
              <div key={i} className="rounded-md border p-3" style={{ borderColor: m.kisaDonusOnerilir ? brand.ink : brand.border }}>
                <div className="flex items-center justify-between">
                  <b style={{ color: brand.ink }}>{m.ad}</b>
                  <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold" style={{ background: m.crossover === "x" ? CK.goodBgSoft : "#F1F5F9", color: brand.inkSoft }}>
                    {m.crossover === "x" ? "X scissors" : "S tek"} · {m.makasSayisi} makas · {m.kisaDonusOnerilir ? `KISA DÖNÜŞ ADAYI (%${m.kisaDonusYuzde})` : "dengeli"}
                  </span>
                </div>
                <div className="mt-1 text-xs" style={{ color: brand.muted }}>{m.yorum} {m.sureNotu}</div>
                <div className="mt-2 space-y-1">
                  {m.varyasyonlar.map((v, j) => (
                    <div key={j} className="text-xs" style={{ color: brand.inkSoft }}>
                      <b>• {v.ad}:</b> {v.aciklama}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Yolcu yük profili */}
      <Panel baslik="Yolcu Yük Profili (hat boyu)" aciklama="Her durakta iki yön araç yükü (yolcu/saat) ve doluluk — tepe yük darboğaz kesimidir.">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ color: brand.inkSoft }}>
            <thead>
              <tr style={{ color: brand.muted }}>
                <th className="px-1 py-1 text-left">Durak</th>
                <th className="px-1 py-1 text-right">Binen</th>
                <th className="px-1 py-1 text-right">İnen</th>
                <th className="px-1 py-1 text-right">Gidiş yük</th>
                <th className="px-1 py-1 text-right">Dönüş yük</th>
                <th className="px-1 py-1 text-right">Doluluk</th>
              </tr>
            </thead>
            <tbody>
              {rapor.duraklar.map((d, i) => {
                const tik = d.doluluk > (isletme.dolulukHedefi || 0.85);
                return (
                  <tr key={i} style={{ background: d.ad === rapor.tepeDurak ? "#FEF2F2" : i % 2 ? "#FBFCFD" : "transparent" }}>
                    <td className="px-1 py-0.5 text-left">{d.makasVar ? "◆ " : ""}{d.terminal ? "⊚ " : ""}{d.ad}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{d.binen}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{d.inen}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{d.yukGidis}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{d.yukDonus}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums font-semibold" style={{ color: tik ? CK.red : brand.inkSoft }}>%{Math.round(d.doluluk * 100)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs" style={{ color: brand.muted }}>Tepe yük: <b>{rapor.tepeDurak}</b> — {rapor.tepeYuk} yolcu/saat. ◆ makaslı durak · ⊚ terminal. Kırmızı doluluk = hedefi aşan (tıkanan) kesim.</p>
      </Panel>
    </div>
  );
}
