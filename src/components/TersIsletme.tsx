"use client";

// raysim — TERS İŞLETME bölümü: kısa dönüş / makas varyasyonları / talep-dönüş / filo.
// İki girdi modu: "Toplam" (pik yolcu/saat, rolden tahmin) ve "Her İstasyon" (durak-başı
// iniş/biniş → kümülatif yük). Sonuçlar çekmece (drawer) yapısında — az yer kaplar.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { tersIsletmeAnaliz, tavsiyeTramvaySayisi } from "@/lib/anaray/tersisletme";
import { Num, SubBaslik } from "@/components/RingUI";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

function Kucuk({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-[0.65rem] leading-snug" style={{ color: brand.muted }}>{children}</span>;
}

/** Çekmece (drawer) — tek tuşla aşağı açılır; kapalıyken yer kaplamaz. */
function Cekmece({ baslik, ozet, acik, onToggle, vurgu, children }: {
  baslik: string; ozet?: React.ReactNode; acik: boolean; onToggle: () => void; vurgu?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border" style={{ borderColor: vurgu || brand.border, background: brand.surface }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="text-sm font-semibold" style={{ color: brand.ink }}>{baslik}</span>
        <span className="flex items-center gap-2 text-xs" style={{ color: brand.muted }}>{ozet}<span style={{ color: brand.inkSoft }}>{acik ? "▲" : "▼"}</span></span>
      </button>
      {acik && <div className="border-t px-3 py-2" style={{ borderColor: brand.border }}>{children}</div>}
    </div>
  );
}

const FILO_RENK: Record<string, { bg: string; bd: string; ad: string }> = {
  arttir: { bg: "#FEF2F2", bd: CK.red, ad: "ARAÇ EKLE" },
  azalt: { bg: CK.goodBgSoft, bd: brand.ink, ad: "ARAÇ ÇEK" },
  yeterli: { bg: CK.goodBgSoft, bd: "#16794C", ad: "FİLO YETERLİ" },
  kapasiteYetmez: { bg: "#FEF2F2", bd: CK.red, ad: "KAPASİTE YETMEZ" },
};

type DrawerId = "girdi" | "depo" | "donus" | "makas" | "profil";

export function TersIsletme() {
  const { cfg } = useSimConfig();
  const { rings: ringsHam } = useProje();
  const { arac: stock } = useArac();
  const { isletme, patchIsletme } = useIsletme();
  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);

  const [mod, setMod] = useState<"toplam" | "istasyon">("toplam");
  const [acik, setAcik] = useState<Record<DrawerId, boolean>>({ girdi: true, depo: false, donus: false, makas: false, profil: false });
  const topla = (id: DrawerId) => setAcik((a) => ({ ...a, [id]: !a[id] }));
  const hepsi = (v: boolean) => setAcik({ girdi: v, depo: v, donus: v, makas: v, profil: v });
  // Tavsiye kartından "etkileyen girdi"ye yönlendirme: talep çekmecesini aç + kaydır.
  const acGirdi = () => { setAcik((a) => ({ ...a, girdi: true })); requestAnimationFrame(() => document.getElementById("talep-girdileri")?.scrollIntoView({ behavior: "smooth", block: "start" })); };

  const rapor = useMemo(() => tersIsletmeAnaliz(rings, stock, isletme, cfg), [rings, stock, isletme, cfg]);
  const tavsiye = useMemo(() => tavsiyeTramvaySayisi(rings, stock, isletme, cfg), [rings, stock, isletme, cfg]);

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
  const hedef = isletme.dolulukHedefi || 0.85;
  const gercekVar = rapor.gercekVeri; // durak-başı gerçek iniş/biniş girildi mi
  const toplamBinen = rapor.duraklar.reduce((s, d) => s + d.binen, 0); // girili/etkin toplam biniş (yolcu/sa)

  const setIstYolcu = (ad: string, alan: "binen" | "inen", v: number) => {
    const cur = isletme.istasyonYolcu ?? {};
    const durak = cur[ad] ?? { binen: 0, inen: 0 };
    patchIsletme({ istasyonYolcu: { ...cur, [ad]: { ...durak, [alan]: Math.max(0, Math.round(v)) } } });
  };

  return (
    <div className="space-y-3">
      <div>
        <SubBaslik>Ters İşletme — Kısa Dönüş, Makas Varyasyonları & Filo</SubBaslik>
        <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>
          Bütün trenler tek depodan çıkar; bazıları ilk makastan karşı şeride geçip ters yönde işe başlar. Uç terminaller VE ara istasyonlardaki makas bölgeleri (özellikle S makaslar) birer kısa-dönüş noktasıdır. Sistem yolcu talep dağılımına göre her makasın ters-işletme varyasyonlarını, hangi durakların dönüşe ihtiyaç duyacağını ve pik talebi tıkanmadan karşılayacak filoyu yorumlar.
        </p>
        <div className="mt-1 text-right">
          <button type="button" onClick={() => hepsi(!Object.values(acik).every(Boolean))} className="text-xs underline" style={{ color: brand.inkSoft }}>
            {Object.values(acik).every(Boolean) ? "tümünü kapat" : "tümünü aç"}
          </button>
        </div>
      </div>

      {/* FİLO ÖNERİSİ — headline, daima görünür */}
      <div className="rounded-lg border-2 p-4" style={{ borderColor: renk.bd, background: renk.bg }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: renk.bd }}>{renk.ad}</span>
          <span className="text-xs" style={{ color: brand.muted }}>pik talebi {pct(hedef)} dolulukla · {mod === "istasyon" ? "durak-başı veri" : "toplam tahmin"}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums" style={{ color: brand.ink }}>{f.gerekenArac}</span>
          <span className="text-sm" style={{ color: brand.inkSoft }}>gereken araç · mevcut pik {f.mevcutPik} · {f.fark > 0 ? `+${f.fark} ekle` : f.fark < 0 ? `${f.fark} çek` : "değişim yok"}</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>{f.aciklama}</p>
        {f.kisaDonusTasarruf > 0 && (
          <p className="mt-1 text-xs" style={{ color: brand.muted }}>Kısa dönüşle dış kolda boş sefer azalır → ~{f.kisaDonusTasarruf} araç tasarruf ({f.gerekenAracKisaDonusle} araç). Sürdürülebilir tavan {rapor.maksSurdurulebilir} tramvay.</p>
        )}
        <p className="mt-1 text-xs" style={{ color: brand.muted }}>Tepe yük: <b>{rapor.tepeDurak}</b> {rapor.tepeYuk} yolcu/saat · çevrim {Math.round(rapor.cevrimSn / 60)} dk · frekans {rapor.mevcutFrekans.toFixed(1)} tren/sa · araç {rapor.aracKapasite} kişi.</p>
      </div>

      {/* TAVSİYE EDİLEN TRAMVAY SAYISI — dinamik, talep + kurp konforu + tüm parametreler */}
      {tavsiye && (
        <div className="rounded-lg border-2 p-4" style={{ borderColor: brand.ink, background: "#F7F9FB" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: brand.ink }}>Tavsiye Edilen Tramvay Sayısı</span>
            <span className="text-xs" style={{ color: brand.muted }}>
              belirleyen: {tavsiye.surucu === "talep" ? "yolcu talebi" : tavsiye.surucu === "frekans" ? "hedef sefer aralığı" : "kapasite tavanı"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-4xl font-bold tabular-nums" style={{ color: brand.ink }}>{tavsiye.tavsiye}</span>
            <span className="text-sm" style={{ color: brand.inkSoft }}>
              tramvay · aralık ~{Math.round(tavsiye.ulasilanHeadwaySn)} s · tepe doluluk %{Math.round(tavsiye.ulasilanDoluluk * 100)}
            </span>
          </div>
          {/* Sürücü kırılımı */}
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded p-1.5" style={{ background: "#EEF6EE" }}>
              <div className="font-bold tabular-nums" style={{ color: "#2E7D32" }}>{tavsiye.talepArac}</div>
              <div style={{ color: brand.muted }}>talep (%{Math.round(tavsiye.dolulukHedefi * 100)} doluluk)</div>
            </div>
            <div className="rounded p-1.5" style={{ background: "#EEF1F6" }}>
              <div className="font-bold tabular-nums" style={{ color: brand.ink }}>{tavsiye.frekansArac}</div>
              <div style={{ color: brand.muted }}>sefer sıklığı (hedef {cfg.headway}s)</div>
            </div>
            <div className="rounded p-1.5" style={{ background: "#FBF6EA" }}>
              <div className="font-bold tabular-nums" style={{ color: "#8a6d1a" }}>{tavsiye.maksTavan}</div>
              <div style={{ color: brand.muted }}>sürdürülebilir tavan</div>
            </div>
          </div>
          {tavsiye.kurpAdet > 0 && (
            <p className="mt-2 text-xs" style={{ color: tavsiye.kurpUyariTavsiye < tavsiye.kurpUyariMevcut ? "#2E7D32" : brand.muted }}>
              🛤 Kurp konforu: {tavsiye.kurpAdet} kurptan {tavsiye.kurpUyariMevcut}'inde ayakta-yolcu uyarısı vardı; bu filoda <b>{tavsiye.kurpUyariTavsiye}</b>'e iniyor{tavsiye.kurpUyariTavsiye < tavsiye.kurpUyariMevcut ? " (düşük doluluk → kurplarda konfor düzeliyor)" : ""}.
            </p>
          )}
          <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>{tavsiye.gerekce}</p>
          {/* Etkileyen girdilere yönlendirme */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2 text-[0.72rem]" style={{ borderColor: brand.border }}>
            <span style={{ color: brand.muted }}>Etkileyen girdiler →</span>
            <button type="button" onClick={acGirdi} className="rounded border px-2 py-0.5 font-medium" style={{ borderColor: brand.border, color: brand.ink }}
              title="Durak yolcu talebi + araç kapasitesi + doluluk hedefi (bu sayfada)">📊 Talep · kapasite · doluluk</button>
            <Link href="/ringler" className="rounded border px-2 py-0.5 font-medium" style={{ borderColor: brand.border, color: brand.ink }}
              title="Kurplar (çevrimi ve konforu etkiler) + sahasal hız — Ringler">🛤 Kurplar & hız</Link>
            <Link href="/sistem" className="rounded border px-2 py-0.5 font-medium" style={{ borderColor: brand.border, color: brand.ink }}
              title="Hedef sefer aralığı (headway) + yanal ivme/konfor tavanı + ivme/fren — Sistem Merkezi">⚙ Hedef aralık · konfor</Link>
          </div>
        </div>
      )}

      {/* GİRDİ — Toplam / Her İstasyon sekmeleri (çekmece) */}
      <div id="talep-girdileri" className="scroll-mt-24">
      <Cekmece baslik="Talep Girdileri" acik={acik.girdi} onToggle={() => topla("girdi")}
        ozet={<span>{mod === "istasyon" ? "her istasyon" : "toplam"} · {toplamBinen}/sa</span>}>
        <div className="mb-2 flex gap-1">
          {([["toplam", "Toplam Talep"], ["istasyon", "Her İstasyon"]] as const).map(([m, ad]) => (
            <button key={m} type="button" onClick={() => setMod(m)}
              className="rounded border px-2.5 py-1 text-xs font-medium"
              style={mod === m ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { borderColor: brand.border, color: brand.inkSoft }}>
              {ad}
            </button>
          ))}
        </div>
        {/* ORTAK GİRDİLER — her iki görünümde de aynı; görünüm seçimi SONUCU DEĞİŞTİRMEZ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><Num label="Pik saat yolcu (toplam)" suffix="yolcu/sa" step={100} value={isletme.pikYolcuSaat}
            onChange={(v) => patchIsletme({ pikYolcuSaat: Math.max(0, Math.round(v)) })} /><Kucuk>toplam talep tabanı — rolden duraklara dağıtılır{gercekVar ? ` · girili toplam ≈ ${toplamBinen} biniş/sa` : ""}</Kucuk></div>
          <div><Num label="Araç yolcu kapasitesi" suffix="kişi" step={10} value={isletme.aracYolcuKapasite}
            onChange={(v) => patchIsletme({ aracYolcuKapasite: Math.max(1, Math.round(v)) })} /><Kucuk>tıkanmadan taşınan (Škoda 28T ~220 / 364 crush)</Kucuk></div>
          <div><Num label="Doluluk hedefi" suffix="%" step={5} value={Math.round(hedef * 100)}
            onChange={(v) => patchIsletme({ dolulukHedefi: Math.min(1, Math.max(0.3, v / 100)) })} /><Kucuk>bu oranın üstü "tıkanma"</Kucuk></div>
        </div>
        <p className="mt-2 text-xs" style={{ color: brand.muted }}>
          ℹ️ <b>İki görünüm de AYNI modeli besler</b> — sekme değiştirmek sonucu değiştirmez. <b>Toplam Talep</b>: tek sayı girersin, rolden (hastane/aktarma/stadyum/merkez=yoğun) duraklara dağıtılır. <b>Her İstasyon</b>: durak-başı gerçek iniş/biniş girersin (girilenler tahmini EZER). Girdiğin durak-başı değerler her iki görünümde de geçerlidir.
        </p>
        {mod === "istasyon" && (
          <div className="mt-2">
            <p className="mb-1 text-xs" style={{ color: brand.muted }}>Her durakta pik saat iniş/biniş (yolcu/saat). Tablo, üstteki toplamdan rol-tahminiyle DOLU gelir — düzenlediğin değer kalıcı kaydolur ve tahmini ezer. Yük <b>kümülatif</b> hesaplanır (Σbinen − Σinen). Dwell/kapasiteyi etkilemez. {gercekVar ? <>Girili toplam biniş: <b>{toplamBinen}/sa</b>.</> : "Henüz elle giriş yok — hepsi tahmin."}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ color: brand.inkSoft }}>
                <thead><tr style={{ color: brand.muted }}>
                  <th className="px-1 py-0.5 text-left">Durak</th><th className="px-1 py-0.5 text-right">Binen</th><th className="px-1 py-0.5 text-right">İnen</th><th className="px-1 py-0.5 text-right">Yük</th>
                </tr></thead>
                <tbody>
                  {rapor.duraklar.map((d, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#FBFCFD" : "transparent" }}>
                      <td className="px-1 py-0.5 text-left">{d.makasVar ? "◆ " : ""}{d.terminal ? "⊚ " : ""}{d.ad}</td>
                      <td className="px-1 py-0.5 text-right"><input type="number" value={d.binen} onChange={(e) => setIstYolcu(d.ad, "binen", +e.target.value)}
                        className="w-16 rounded border px-1 py-0.5 text-right tabular-nums" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-0.5 text-right"><input type="number" value={d.inen} onChange={(e) => setIstYolcu(d.ad, "inen", +e.target.value)}
                        className="w-16 rounded border px-1 py-0.5 text-right tabular-nums" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-0.5 text-right tabular-nums font-semibold" style={{ color: d.doluluk > hedef ? CK.red : brand.inkSoft }}>{d.tepeYuk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isletme.istasyonYolcu && Object.keys(isletme.istasyonYolcu).length > 0 && (
              <button type="button" onClick={() => patchIsletme({ istasyonYolcu: {} })} className="mt-1 text-xs underline" style={{ color: brand.muted }}>tahmine sıfırla</button>
            )}
          </div>
        )}
      </Cekmece>
      </div>

      {/* DEPO DAĞILIMI */}
      <Cekmece baslik="Depo Çıkışı — Tek Depodan İki Yön" acik={acik.depo} onToggle={() => topla("depo")}
        ozet={<span>{rapor.depoDagilim.gidis} gidiş / {rapor.depoDagilim.donus} ters</span>}>
        <div className="flex flex-wrap gap-4">
          <div className="rounded border px-3 py-2" style={{ borderColor: brand.border }}><div className="text-xl font-bold tabular-nums" style={{ color: CK.blue }}>{rapor.depoDagilim.gidis}</div><div className="text-xs" style={{ color: brand.muted }}>gidiş (kendi yönünden çıkar)</div></div>
          <div className="rounded border px-3 py-2" style={{ borderColor: brand.border }}><div className="text-xl font-bold tabular-nums" style={{ color: CK.orange }}>{rapor.depoDagilim.donus}</div><div className="text-xs" style={{ color: brand.muted }}>ters (ilk makastan karşı şeride geçer)</div></div>
        </div>
        <p className="mt-2 text-xs" style={{ color: brand.muted }}>{rapor.depoDagilim.aciklama}</p>
      </Cekmece>

      {/* DÖNÜŞE İHTİYAÇ DUYAN DURAKLAR */}
      <Cekmece baslik="Dönüşe İhtiyaç Duyan Duraklar (yolcu birikimi)" acik={acik.donus} onToggle={() => topla("donus")}
        vurgu={rapor.donusIhtiyaclari.length > 0 ? CK.red : undefined}
        ozet={<span>{rapor.donusIhtiyaclari.length === 0 ? "tıkanma yok" : `${rapor.donusIhtiyaclari.length} tıkanan`}</span>}>
        {rapor.donusIhtiyaclari.length === 0 ? (
          <p className="text-sm" style={{ color: "#16794C" }}>✓ Hiçbir durak tıkanmıyor — talep {pct(hedef)} doluluk hedefinin altında karşılanıyor.</p>
        ) : (
          <div className="space-y-2">
            {rapor.donusIhtiyaclari.map((d, i) => {
              const sev = d.siddet === "kritik" ? CK.red : d.siddet === "yuksek" ? CK.amber : brand.inkSoft;
              return (
                <div key={i} className="rounded border-l-4 px-3 py-1.5 text-sm" style={{ borderColor: sev, background: "#FBFCFD" }}>
                  <div className="flex items-center justify-between"><b style={{ color: brand.ink }}>{d.durak}</b><span className="text-xs font-semibold" style={{ color: sev }}>doluluk %{Math.round(d.doluluk * 100)} · {d.siddet.toLocaleUpperCase("tr")}</span></div>
                  <div className="text-xs" style={{ color: brand.muted }}>{d.sebep} → <b>{d.oneriMakas}</b> makasından kısa dönüş bu kesimin sıklığını artırır.</div>
                </div>
              );
            })}
          </div>
        )}
      </Cekmece>

      {/* MAKAS-BAŞI TERS İŞLETME VARYASYONLARI */}
      <Cekmece baslik="Makas Bölgesi Başına Ters İşletme Varyasyonları" acik={acik.makas} onToggle={() => topla("makas")}
        ozet={<span>{rapor.makaslar.length} makas · {rapor.makaslar.filter((m) => m.kisaDonusOnerilir).length} kısa-dönüş adayı</span>}>
        <p className="mb-2 text-xs" style={{ color: brand.muted }}>Ara istasyonlardaki makaslar dâhil her bölgenin kısa-dönüş rolü + tüm ters-işletme ihtimalleri; süreler değişmeden yoğunluğa karşı nasıl kullanılır.</p>
        {rapor.makaslar.length === 0 ? (
          <p className="text-sm" style={{ color: brand.muted }}>Ara istasyonlarda makas bölgesi yok (yalnız uç terminaller dönüş yapıyor).</p>
        ) : (
          <div className="space-y-3">
            {rapor.makaslar.map((m, i) => (
              <div key={i} className="rounded-md border p-3" style={{ borderColor: m.kisaDonusOnerilir ? brand.ink : brand.border }}>
                <div className="flex items-center justify-between">
                  <b style={{ color: brand.ink }}>{m.ad}</b>
                  <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold" style={{ background: m.crossover === "x" ? CK.goodBgSoft : "#F1F5F9", color: brand.inkSoft }}>
                    {m.makasSayisi} {m.crossover === "x" ? "X" : "S"}-makas · {m.kisaDonusOnerilir ? `KISA DÖNÜŞ ADAYI (%${m.kisaDonusYuzde})` : "dengeli"}
                  </span>
                </div>
                <div className="mt-1 text-xs" style={{ color: brand.muted }}>{m.yorum} {m.sureNotu}</div>
                <div className="mt-2 space-y-1">
                  {m.varyasyonlar.map((v, j) => (<div key={j} className="text-xs" style={{ color: brand.inkSoft }}><b>• {v.ad}:</b> {v.aciklama}</div>))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Cekmece>

      {/* YOLCU YÜK PROFİLİ */}
      <Cekmece baslik="Yolcu Yük Profili (hat boyu)" acik={acik.profil} onToggle={() => topla("profil")}
        ozet={<span>tepe {rapor.tepeYuk} @ {rapor.tepeDurak}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ color: brand.inkSoft }}>
            <thead><tr style={{ color: brand.muted }}>
              <th className="px-1 py-1 text-left">Durak</th><th className="px-1 py-1 text-right">Binen</th><th className="px-1 py-1 text-right">İnen</th><th className="px-1 py-1 text-right">Gidiş yük</th><th className="px-1 py-1 text-right">Dönüş yük</th><th className="px-1 py-1 text-right">Doluluk</th>
            </tr></thead>
            <tbody>
              {rapor.duraklar.map((d, i) => {
                const tik = d.doluluk > hedef;
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
        <p className="mt-1 text-xs" style={{ color: brand.muted }}>◆ makaslı durak · ⊚ terminal · kırmızı = tıkanan kesim.</p>
      </Cekmece>
    </div>
  );
}
