"use client";

// raysim — paylaşılan SİMÜLASYON PARAMETRELERİ düzenleyicisi.
//
// Tek kaynak: hem Sistem Merkezi bölümü hem de header'daki hızlı "Parametreler"
// modalı bu bileşeni kullanır → parametre UI'si tek yerde tanımlı, iki yerde de
// aynı. Değişiklik `patch({ [key]: ... })` ile cfg'ye yazılır → tüm modüller canlı
// güncellenir + otomatik kaydedilir (global "✓ Kaydedildi" bildirimi).

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig } from "@/components/SimConfigProvider";
import { useDil } from "@/components/DilProvider";
import { PARAM_META, paramGoster, paramSI, birim, type ParamMeta, type ParamModul } from "@/lib/anaray/config";

// Modül etiketleri = kategorik seri (valide: mavi · turkuaz).
const MODUL_RENK: Record<ParamModul, string> = { sefer: CK.blue, ringler: CK.aqua };

// Görünen metin çevirileri (TR kaynak → EN·DE). Alan tanımları (PARAM_META) bileşen
// DIŞINDA (config.ts) tanımlı olduğundan t() hook'u orada kullanılamaz → görünen
// etiketleri TR kaynağa göre burada eşleyip bileşen içinde t() ile render ediyoruz.
// Anahtarlar config'teki TR metinle BİREBİR aynı; eşleşmeyen metin TR'de kalır.
const GRUP_CEV: Record<string, { en: string; de: string }> = {
  "Hızlar": { en: "Speeds", de: "Geschwindigkeiten" },
  "Dinamik": { en: "Dynamics", de: "Dynamik" },
  "Headway & Mesafe": { en: "Headway & Distance", de: "Zugfolgezeit & Abstand" },
  "Zamanlayıcılar": { en: "Timers", de: "Zeitgeber" },
  "Blok": { en: "Block", de: "Block" },
  "Kurp & Konfor": { en: "Curve & Comfort", de: "Bogen & Komfort" },
  "Kapasite planlama": { en: "Capacity planning", de: "Kapazitätsplanung" },
};
const AD_CEV: Record<string, { en: string; de: string }> = {
  "Ana hat azami hız": { en: "Mainline maximum speed", de: "Streckenhöchstgeschwindigkeit" },
  "Sahasal işletme hızı": { en: "Field operating speed", de: "Feldbetriebsgeschwindigkeit" },
  "Makas geçiş hızı": { en: "Switch transit speed", de: "Weichengeschwindigkeit" },
  "Hemzemin/yaya hızı": { en: "Level-crossing / pedestrian speed", de: "Bahnübergangs-/Fußgängergeschwindigkeit" },
  "Acil frenleme hızı": { en: "Emergency braking speed", de: "Notbremsgeschwindigkeit" },
  "Kalkış ivme tavanı (a)": { en: "Departure acceleration limit (a)", de: "Anfahrbeschleunigungsgrenze (a)" },
  "Servis freni (b)": { en: "Service brake (b)", de: "Betriebsbremse (b)" },
  "Hedef headway": { en: "Target headway", de: "Ziel-Zugfolgezeit" },
  "Ortalama durak arası": { en: "Average stop spacing", de: "Mittlerer Haltestellenabstand" },
  "Worst-case mesafe": { en: "Worst-case distance", de: "Worst-Case-Abstand" },
  "Route release (ana hat)": { en: "Route release (mainline)", de: "Fahrstraßenauflösung (Strecke)" },
  "Route release (depo)": { en: "Route release (depot)", de: "Fahrstraßenauflösung (Depot)" },
  "Makas adım süresi": { en: "Switch step time", de: "Weichenstellzeit" },
  "Kısıt bölge genişliği": { en: "Restriction zone width", de: "Einschränkungszonenbreite" },
  "Yanal ivme tavanı (kurp)": { en: "Lateral acceleration limit (curve)", de: "Querbeschleunigungsgrenze (Bogen)" },
  "Ray ekartmanı": { en: "Track gauge", de: "Spurweite" },
  "UIC 406 doluluk tavanı": { en: "UIC 406 occupancy ceiling", de: "UIC 406 Auslastungsgrenze" },
};
const ETKI_CEV: Record<string, { en: string; de: string }> = {
  "Serbest seyir üst hızı": { en: "Free-running top speed", de: "Höchstgeschwindigkeit im freien Lauf" },
  "Ring/durak arası ortalama hız": { en: "Average speed between ring/stops", de: "Durchschnittsgeschwindigkeit zwischen Ring/Haltestellen" },
  "Makas bölgesi geçiş hızı": { en: "Switch-zone transit speed", de: "Durchfahrtsgeschwindigkeit im Weichenbereich" },
  "Geçit yavaşlama hızı": { en: "Crossing slow-down speed", de: "Verlangsamungsgeschwindigkeit am Übergang" },
  "Tehlike/acil frenleme noktasında worst-case hız": { en: "Worst-case speed at hazard/emergency braking point", de: "Worst-Case-Geschwindigkeit am Gefahr-/Notbremspunkt" },
  "Kalkış ivmesi ÜST sınırı (konfor); düşürülürse kalkış yumuşar, seyir süresi uzar": { en: "Upper limit of departure acceleration (comfort); lowering it softens departure and lengthens run time", de: "Obergrenze der Anfahrbeschleunigung (Komfort); beim Senken wird die Anfahrt sanfter und die Fahrzeit länger" },
  "Servis fren oranı; düşürülürse fren yumuşar, duruş uzar (araç fren kapasitesini aşamaz)": { en: "Service brake rate; lowering it softens braking and lengthens stopping (cannot exceed vehicle brake capacity)", de: "Betriebsbremsrate; beim Senken wird die Bremsung sanfter und der Halt länger (kann die Fahrzeug-Bremskapazität nicht überschreiten)" },
  "Sefer sıklığı hedefi + ring uygunluk eşiği": { en: "Service frequency target + ring suitability threshold", de: "Ziel der Fahrtenhäufigkeit + Ring-Eignungsschwelle" },
  "Yeni ring nominal mesafesi": { en: "Nominal distance of new ring", de: "Nominaler Abstand des neuen Rings" },
  "Ring worst-case referans mesafesi": { en: "Ring worst-case reference distance", de: "Ring-Worst-Case-Referenzabstand" },
  "Ana hat makas rota serbest bırakma": { en: "Mainline switch route release", de: "Fahrstraßenauflösung der Streckenweiche" },
  "Depo manevra rota serbest bırakma": { en: "Depot shunting route release", de: "Fahrstraßenauflösung des Depot-Rangierens" },
  "Her makas hareketi süresi": { en: "Duration of each switch movement", de: "Dauer jeder Weichenbewegung" },
  "Makas/geçit hız-kısıt bölgesi uzunluğu": { en: "Length of switch/crossing speed-restriction zone", de: "Länge der Weichen-/Übergangs-Geschwindigkeitsbeschränkungszone" },
  "Kurpta yarıçaptan hız türetimi: v=√(R·(a+g·dever/ekartman))": { en: "Speed derivation from radius in curve: v=√(R·(a+g·cant/gauge))", de: "Geschwindigkeitsableitung aus dem Radius im Bogen: v=√(R·(a+g·Überhöhung/Spurweite))" },
  "Kurpta dever (kanto) katkısının hesabı": { en: "Calculation of cant contribution in curve", de: "Berechnung des Überhöhungsbeitrags im Bogen" },
  "İşletme (pratik) kapasite = teorik × tavan": { en: "Operating (practical) capacity = theoretical × ceiling", de: "Betriebliche (praktische) Kapazität = theoretisch × Grenze" },
};

function round(n: number, d = 0) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export function ParametreEditoru() {
  const { cfg, patch, yazilabilir } = useSimConfig();
  const { t } = useDil();

  // TR kaynağı, eşleşen çeviri tablosuna göre seçili dile çevirir; eşleşme yoksa TR kalır.
  const cevir = (tr: string, tbl: Record<string, { en: string; de: string }>) =>
    tbl[tr] ? t({ tr, en: tbl[tr].en, de: tbl[tr].de }) : tr;

  const gruplar = useMemo(() => {
    const g = new Map<string, ParamMeta[]>();
    for (const m of PARAM_META) g.set(m.grup, [...(g.get(m.grup) ?? []), m]);
    return [...g.entries()];
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {gruplar.map(([grup, params]) => (
        <div key={grup}>
          <div className="field-label mb-2 border-b pb-1" style={{ borderColor: brand.border }}>{cevir(grup, GRUP_CEV)}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {params.map((m) => (
              <div key={m.key} className="flex items-center gap-3 rounded border p-2.5" style={{ borderColor: brand.border }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" style={{ color: brand.ink }}>{cevir(m.ad, AD_CEV)}</div>
                  <div className="text-[0.7rem]" style={{ color: brand.muted }}>{cevir(m.etkiler, ETKI_CEV)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.moduller.map((mm) => (<span key={mm} className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium" style={{ background: MODUL_RENK[mm] + "1A", color: MODUL_RENK[mm] }}>{mm}</span>))}
                    <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-mono" style={{ background: CK.track, color: brand.faint }}>{m.kaynak}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <input type="number" value={round(paramGoster(cfg, m), m.tur === "ivme" ? 1 : 0)} step={m.step} min={m.min} max={m.max}
                    disabled={!yazilabilir}
                    onChange={(e) => { const g = parseFloat(e.target.value); if (!Number.isNaN(g)) patch({ [m.key]: paramSI(m, g) }); }}
                    className="w-20 rounded border px-2 py-1 text-right text-sm tabular-nums disabled:opacity-50" style={{ borderColor: brand.border, color: brand.ink }} />
                  <span className="w-10 text-xs" style={{ color: brand.muted }}>{birim(m.tur)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
