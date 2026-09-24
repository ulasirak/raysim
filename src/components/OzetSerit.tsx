"use client";

// raysim — ORTAK ÖZET GÖSTERGE ŞERİDİ.
// Her modülün (Sefer/Studio · Sistem Merkezi · Ringler · Belgeler) EN ÜSTÜNDE aynı
// başlık göstergeleri aynı sırada, aynı stille görünür → müşteri hangi sekmede olursa
// olsun aynı 6 sayıyı aynı yerde bulur ("daha belirtici"). Kaynak: maksimumTren +
// olceklenme + loopDenge — modüllerin kendi panelleriyle BİREBİR aynı türetme (tek
// gerçek kaynak). Ekran daima GERÇEK değeri gösterir; mod/greenwashing yoktur.
// Hat boşken (ring yok) hiçbir şey çizmez → her modülün boş-hat mesajı kendi kalır.

import { useMemo } from "react";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { olceklenme, loopDenge } from "@/lib/anaray/ring";
import { Kpi } from "@/components/Kpi";
import { sure, km } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

export function OzetSerit() {
  const { cfg } = useSimConfig();
  const { rings: ringsHam } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();

  // Dwell OTO ringler hesaplanır → kapasite/denge modüllerle tutarlı olur.
  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);
  const ozet = useMemo(() => {
    if (rings.length === 0) return null;
    const maks = maksimumTren(rings, stock, cfg, isletme);
    const olcek = olceklenme(rings, stock, true, cfg);
    const denge = loopDenge(rings, stock, cfg);
    const uzunluk = rings.reduce((m, r) => m + r.uzunluk, 0);
    return {
      maks,
      uygun: olcek.headwayUygun,
      dengeli: denge.dengeli,
      uzunluk,
      durak: rings.length + 1, // doğrusal hatta durak = hücre + 1
    };
  }, [rings, stock, cfg, isletme]);

  if (!ozet || !ozet.maks.gecerli) return null;
  const m = ozet.maks;
  const iyi = ozet.uygun && ozet.dengeli;

  return (
    <div className="mb-6 rounded-lg border px-4 py-3" style={{ borderColor: brand.border, background: "#F8FAFC" }}>
      <div className="field-label">Özet göstergeler — hattın başlık değerleri (her modülde aynı)</div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi etiket="Hat" deger={`${ozet.durak}`} birim="durak" alt={`${km(ozet.uzunluk)} km`} />
        <Kpi etiket="Çevrim (RTT)" deger={sure(m.cevrimSuresi)} alt="tam gidiş-dönüş" title="Bir tramvayın tam gidiş-dönüş (turnback dâhil) çevrim süresi." />
        <Kpi etiket="Belirleyici kısıt" deger={sure(m.hMin)} alt={m.baglayanAd} title="Min headway'i (en sıkı kısıtı) bağlayan etken." />
        <Kpi etiket="Önerilen filo" deger={`${m.nSurdurulebilir}`} birim="araç" alt="sürdürülebilir (UIC 406)" renk={CK.good} title="Toparlanma payıyla her gün rahat çalışan tramvay sayısı." />
        <Kpi etiket="Kapasite tavanı" deger={`${m.nTeorik}`} birim="araç" alt="fiziksel üst sınır" title="Darboğazın izin verdiği en fazla tramvay (sıfır pay)." />
        <Kpi etiket="Değerlendirme" deger={iyi ? "Uygun" : "Uyarı"} alt={iyi ? "headway + denge uygun" : "headway/denge — detay ilgili modülde"} renk={iyi ? CK.good : CK.amber} />
      </div>
    </div>
  );
}
