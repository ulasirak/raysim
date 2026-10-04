"use client";

// raysim — ŞUBE / TALİ HAT EDİTÖRÜ (dallanma, #1)
// Ana hat (rings) AYNEN kalır; buradan ana hattın bir DURAĞINDAN (kavşak) ayrılan
// şubeler eklenir/düzenlenir. Şube kendi durak-arası zinciridir. Kalıcı: projeye
// (subeler) kaydedilir; Sefer/Canlı Ağ şubeyi grafik ağda gösterir, şube rotası
// ayrı analiz edilebilir.
//
// Katman-1 (netlik): her şube için NEREDEN ayrıldığı (kavşak km'si), NE KADAR uzun
// olduğu (şube km + rota km + durak sayısı) ve NE İŞE YARADIĞI (rota kapasitesi +
// ortak kesim yükü) tek bakışta görünür. Tüm sayılar motordan türer (tahmin yok) ve
// rapordaki 4.4/4.5 bölümleriyle birebir aynı kaynaktan gelir.

import { useMemo } from "react";
import { useProje, useArac, useSimConfig, useIsletme } from "@/components/SimConfigProvider";
import { useDil } from "@/components/DilProvider";
import { brand } from "@/lib/anaray/brand";
import { BosDurum } from "@/components/BosDurum";
import { ringDuraklari, yeniSube, yeniRing, type Sube } from "@/lib/anaray/ring";
import { subeOzeti, ortakKesimAnaliz, type SubeOzet } from "@/lib/anaray/ortakKesim";

export function SubeEditor() {
  const { t } = useDil();
  const { rings, subeler, setSubeler, yazilabilir } = useProje();
  const { arac } = useArac();
  const { cfg } = useSimConfig();
  const { isletme } = useIsletme();
  const duraklar = useMemo(() => ringDuraklari(rings), [rings]);

  // Her şubenin özeti (geometri + rota kapasitesi) — rapor 4.4 ile aynı hesap.
  const ozetler = useMemo<Record<string, SubeOzet>>(
    () => Object.fromEntries(subeler.map((s) => [s.id, subeOzeti(rings, s, arac, cfg, isletme)])),
    [rings, subeler, arac, cfg, isletme],
  );

  // Ortak kesim yükü (servis treni girilen şubeler için) — editörde anında görünür.
  const anaFilo = Math.max(1, isletme.toplamFilo || 1);
  const ortak = useMemo(
    () => ortakKesimAnaliz(rings, subeler, arac, cfg, isletme, anaFilo),
    [rings, subeler, arac, cfg, isletme, anaFilo],
  );

  if (rings.length === 0) return null;

  const guncelle = (id: string, p: Partial<Sube>) =>
    setSubeler((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const ringGuncelle = (sid: string, ridx: number, p: Partial<{ toAd: string; uzunluk: number }>) =>
    setSubeler((ss) => ss.map((s) => (s.id === sid
      ? { ...s, rings: s.rings.map((r, i) => (i === ridx ? { ...r, ...p } : r)) }
      : s)));
  // Şube durağı koordinatı (Katman-2A) — durak ADIYLA saklanır. Boş bırakılan alan koordinatı
  // SİLER (uydurma koordinat üretilmez); ikisi de doluysa coğrafi haritada kavşaktan uzanır.
  const koordGuncelle = (sid: string, ad: string, alan: "lat" | "lon", deger: string) =>
    setSubeler((ss) => ss.map((s) => {
      if (s.id !== sid) return s;
      const k = { ...(s.koordinat || {}) };
      const mevcut = k[ad] || { lat: NaN, lon: NaN };
      const v = deger.trim() === "" ? NaN : Number(deger);
      const yeni = { ...mevcut, [alan]: v };
      if (Number.isFinite(yeni.lat) && Number.isFinite(yeni.lon)) k[ad] = { lat: yeni.lat, lon: yeni.lon };
      else delete k[ad]; // eksik/geçersiz → koordinat yok (dürüst)
      return { ...s, koordinat: Object.keys(k).length ? k : undefined };
    }));
  const durakEkle = (sid: string) =>
    setSubeler((ss) => ss.map((s) => {
      if (s.id !== sid) return s;
      const oncekiAd = s.rings[s.rings.length - 1]?.toAd || "Kavşak";
      const yr = yeniRing(oncekiAd, `Şube Durağı ${s.rings.length + 1}`);
      yr.uzunluk = 800;
      return { ...s, rings: [...s.rings, yr] };
    }));
  const durakSil = (sid: string) =>
    setSubeler((ss) => ss.map((s) => (s.id === sid && s.rings.length > 1
      ? { ...s, rings: s.rings.slice(0, -1) } : s)));
  // Varsayılan kavşak: hattın ~2/3'ünde bir ara durak → şube gerçekten ayrılsın
  // (hat ucunda ayrılmak = uzatma; ortak kesim de o zaman oluşmaz). J ≥ 1 şart.
  const varsayilanKavsak = () => {
    const sonDurak = duraklar.length - 1; // = rings.length
    return Math.max(1, Math.min(sonDurak - 1, Math.round(sonDurak * 0.66))) || Math.max(0, sonDurak - 1);
  };
  const subeEkle = () => setSubeler((ss) => [...ss, yeniSube(varsayilanKavsak(), `Şube ${ss.length + 1}`)]);
  const subeSil = (id: string) => setSubeler((ss) => ss.filter((s) => s.id !== id));

  const inp = "rounded border px-2 py-1 text-sm";
  const inpStyle = { borderColor: brand.border, color: brand.ink };
  const km = (v: number) => v.toFixed(1).replace(".", ",");

  // Küçük etiketli bilgi kutusu
  const Chip = ({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: string }) => (
    <span className="inline-flex flex-col rounded-md border px-2.5 py-1" style={{ borderColor: brand.border, background: "#F7F9FA" }}>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: brand.muted }}>{etiket}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: vurgu || brand.ink }}>{deger}</span>
    </span>
  );

  return (
    <details className="mt-4 rounded-lg border bg-white" style={{ borderColor: brand.border }}>
      <summary className="flex cursor-pointer select-none items-center gap-2 p-4">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Şubeler / Tali Hatlar (Dallanma)", en: "Branches / Secondary Lines (Branching)", de: "Zweigstrecken / Nebenstrecken (Verzweigung)" })}</span>
        <span className="ml-2 text-xs" style={{ color: brand.muted }}>{subeler.length ? `${subeler.length} ${t({ tr: "şube", en: "branches", de: "Zweigstrecken" })}` : t({ tr: "ana hattan ayrılan tali hat ekle", en: "add a branch line splitting off the main line", de: "eine von der Hauptstrecke abzweigende Nebenstrecke hinzufügen" })}</span>
      </summary>
      <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: brand.border }}>
        <p className="mb-3 text-xs leading-relaxed" style={{ color: brand.muted }}>
          {t({
            tr: "Tali hat, ana hattın bir durağından (kavşak) ayrılan ikinci bir koldur — havalimanı, OSB ya da depo bağlantısı gibi. Ana hat hiç değişmez. Sistem, bu kolu ekleyince iki şeyi otomatik hesaplar: (1) kolun kendi rota kapasitesi, (2) hat başı ile kavşak arasındaki ORTAK ana hat kesiminin ana hat + kol birleşik yükü — dallanmanın gerçek darboğazı. Aşağıda kavşağın km'si, kolun uzunluğu ve kapasitesi her şube için görünür.",
            en: "A branch is a second arm splitting off from a stop on the main line (junction) — an airport, industrial-zone or depot link. The main line never changes. Adding a branch computes two things automatically: (1) the branch's own route capacity, (2) the combined trunk+branch load on the SHARED trunk section between the line start and the junction — branching's real bottleneck. Each branch's junction km, length and capacity are shown below.",
            de: "Eine Zweigstrecke ist ein zweiter Arm, der an einer Haltestelle der Hauptstrecke (Knoten) abzweigt — etwa Flughafen-, Gewerbegebiet- oder Depotanbindung. Die Hauptstrecke bleibt unverändert. Das Hinzufügen berechnet automatisch: (1) die eigene Streckenkapazität des Zweigs, (2) die kombinierte Haupt+Zweig-Last auf dem GEMEINSAMEN Abschnitt zwischen Streckenanfang und Knoten — der eigentliche Engpass der Verzweigung. Knoten-km, Länge und Kapazität jeder Zweigstrecke stehen unten.",
          })}
        </p>

        {subeler.length === 0 && (
          <div className="mb-3">
            <BosDurum sik baslik={t({ tr: "Henüz şube yok", en: "No branches yet", de: "Noch keine Zweigstrecken" })} ipucu={t({ tr: "Aşağıdan bir durağı kavşak seçip tali hat ekleyin.", en: "Pick a stop as junction below and add a branch line.", de: "Wählen Sie unten eine Haltestelle als Knoten und fügen Sie eine Zweigstrecke hinzu." })} />
          </div>
        )}

        <div className="space-y-4">
          {subeler.map((s) => {
            const o = ozetler[s.id];
            const gecerli = o?.maks.gecerli;
            return (
            <div key={s.id} className="rounded-md border p-3" style={{ borderColor: brand.borderStrong }}>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs" style={{ color: brand.inkSoft }}>
                  {t({ tr: "Şube adı", en: "Branch name", de: "Name der Zweigstrecke" })}
                  <input disabled={!yazilabilir} value={s.ad} onChange={(e) => guncelle(s.id, { ad: e.target.value })}
                    className={`${inp} ml-2 w-44`} style={inpStyle} />
                </label>
                <label className="text-xs" style={{ color: brand.inkSoft }}>
                  {t({ tr: "Kavşak (ayrılma durağı)", en: "Junction (split-off stop)", de: "Knoten (Abzweighaltestelle)" })}
                  <select disabled={!yazilabilir} value={s.atIndex}
                    onChange={(e) => guncelle(s.id, { atIndex: +e.target.value })}
                    className={`${inp} ml-2`} style={inpStyle}>
                    {duraklar.map((d, i) => <option key={i} value={i}>{i + 1}. {d.ad} — {km(d.konum / 1000)} km</option>)}
                  </select>
                </label>
                <label className="text-xs" style={{ color: brand.inkSoft }} title={t({ tr: "Bu kola giden tren sayısı. Girilirse ortak kesim (hat başı→kavşak) birleşik yükü hesaplanır. 0/boş = kapalı (tahmin yok).", en: "Number of trains running to this branch. If set, the combined load of the shared section (line start → junction) is computed. 0/empty = off (no estimate).", de: "Anzahl der Züge auf diesem Zweig. Wenn gesetzt, wird die kombinierte Last des gemeinsamen Abschnitts (Streckenanfang → Knoten) berechnet. 0/leer = aus (keine Schätzung)." })}>
                  {t({ tr: "Servis treni", en: "Service trains", de: "Betriebszüge" })}
                  <input disabled={!yazilabilir} type="number" min={0} max={99} value={s.servisTren ?? 0}
                    onChange={(e) => guncelle(s.id, { servisTren: Math.max(0, Math.min(99, +e.target.value || 0)) })}
                    className={`${inp} ml-2 w-20`} style={inpStyle} />
                </label>
                <button disabled={!yazilabilir} onClick={() => subeSil(s.id)}
                  className="ml-auto rounded border px-3 py-1 text-xs font-semibold disabled:opacity-40"
                  style={{ borderColor: brand.red, color: brand.red }}>{t({ tr: "Şubeyi sil", en: "Delete branch", de: "Zweigstrecke löschen" })}</button>
              </div>

              {/* Otomatik özet: nereden / ne kadar / ne işe yarar */}
              {o && (
                <div className="mt-3 flex flex-wrap items-stretch gap-2">
                  <Chip etiket={t({ tr: "Kavşak", en: "Junction", de: "Knoten" })} deger={`${o.kavsakAd} · ${km(o.kavsakKm)} km`} />
                  <Chip etiket={t({ tr: "Şube uzunluğu", en: "Branch length", de: "Zweiglänge" })} deger={`${km(o.subeKm)} km`} />
                  <Chip etiket={t({ tr: "Durak", en: "Stops", de: "Halte" })} deger={`${o.durakSayisi}`} />
                  <Chip etiket={t({ tr: "Rota (hat başı→uç)", en: "Route (start→end)", de: "Route (Anfang→Ende)" })} deger={`${km(o.rotaKm)} km`} />
                  {gecerli ? (
                    <>
                      <Chip etiket={t({ tr: "Sürdürülebilir tramvay", en: "Sustainable trams", de: "Nachhaltige Bahnen" })} deger={`${o.maks.nSurdurulebilir}`} />
                      <Chip etiket={t({ tr: "Min headway", en: "Min headway", de: "Min. Zugfolge" })} deger={`${Math.round(o.maks.hMin)} s`} />
                      <Chip etiket={t({ tr: "Gidiş-dönüş", en: "Round trip", de: "Umlauf" })} deger={`~${Math.round(o.maks.cevrimSuresi / 60)} dk`} />
                      <Chip etiket={t({ tr: "Belirleyici kısıt", en: "Determining constraint", de: "Maßgebende Bedingung" })} deger={o.maks.baglayanAd || "—"} />
                    </>
                  ) : (
                    <Chip etiket={t({ tr: "Kapasite", en: "Capacity", de: "Kapazität" })} deger={t({ tr: "durak ekleyin", en: "add stops", de: "Halte hinzufügen" })} vurgu={brand.muted} />
                  )}
                </div>
              )}

              {/* Şube durakları */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: brand.muted }}>
                      <th className="px-1 py-1 text-left text-xs font-medium">#</th>
                      <th className="px-1 py-1 text-left text-xs font-medium">{t({ tr: "Durak adı", en: "Stop name", de: "Haltestellenname" })}</th>
                      <th className="px-1 py-1 text-left text-xs font-medium">{t({ tr: "Önceki duraktan mesafe (m)", en: "Distance from previous stop (m)", de: "Entfernung zur vorherigen Haltestelle (m)" })}</th>
                      <th className="px-1 py-1 text-left text-xs font-medium" title={t({ tr: "Gerçek koordinat (opsiyonel). İkisi de dolu olunca şube coğrafi haritada kavşaktan gerçek yere uzanır. Boş = şematik (uydurma koordinat yok).", en: "Real coordinate (optional). When both are set, the branch extends to its real place on the geographic map. Empty = schematic (no fabricated coords).", de: "Echte Koordinate (optional). Wenn beide gesetzt sind, verläuft die Zweigstrecke auf der geografischen Karte zum echten Ort. Leer = schematisch (keine erfundenen Koordinaten)." })}>{t({ tr: "Enlem", en: "Lat", de: "Breite" })}</th>
                      <th className="px-1 py-1 text-left text-xs font-medium">{t({ tr: "Boylam", en: "Lon", de: "Länge" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rings.map((r, i) => (
                      <tr key={r.id}>
                        <td className="px-1 py-0.5 text-xs" style={{ color: brand.muted }}>{i + 1}</td>
                        <td className="px-1 py-0.5">
                          <input disabled={!yazilabilir} value={r.toAd}
                            onChange={(e) => ringGuncelle(s.id, i, { toAd: e.target.value })}
                            className={`${inp} w-48`} style={inpStyle} />
                        </td>
                        <td className="px-1 py-0.5">
                          <input disabled={!yazilabilir} type="number" min={50} step={50} value={Math.round(r.uzunluk)}
                            onChange={(e) => ringGuncelle(s.id, i, { uzunluk: Math.max(50, +e.target.value || 50) })}
                            className={`${inp} w-28`} style={inpStyle} />
                        </td>
                        <td className="px-1 py-0.5">
                          <input disabled={!yazilabilir} type="number" step="any" placeholder="—"
                            value={s.koordinat?.[r.toAd]?.lat ?? ""}
                            onChange={(e) => koordGuncelle(s.id, r.toAd, "lat", e.target.value)}
                            className={`${inp} w-24`} style={inpStyle} />
                        </td>
                        <td className="px-1 py-0.5">
                          <input disabled={!yazilabilir} type="number" step="any" placeholder="—"
                            value={s.koordinat?.[r.toAd]?.lon ?? ""}
                            onChange={(e) => koordGuncelle(s.id, r.toAd, "lon", e.target.value)}
                            className={`${inp} w-24`} style={inpStyle} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex gap-2">
                <button disabled={!yazilabilir} onClick={() => durakEkle(s.id)}
                  className="rounded border px-3 py-1 text-xs font-semibold disabled:opacity-40"
                  style={{ borderColor: brand.borderStrong, color: brand.ink }}>{t({ tr: "+ Durak ekle", en: "+ Add stop", de: "+ Haltestelle hinzufügen" })}</button>
                <button disabled={!yazilabilir || s.rings.length <= 1} onClick={() => durakSil(s.id)}
                  className="rounded border px-3 py-1 text-xs font-semibold disabled:opacity-40"
                  style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>{t({ tr: "− Son durağı sil", en: "− Remove last stop", de: "− Letzte Haltestelle entfernen" })}</button>
              </div>
            </div>
          );})}
        </div>

        {/* Ortak kesim yükü — servis treni girilen şubelerin ana hatla birleşik yükü */}
        {ortak.aktif && ortak.kesimler.length > 0 && (
          <div className="mt-4 rounded-md border p-3" style={{ borderColor: ortak.uygun ? brand.border : brand.red, background: ortak.uygun ? ("#F7F9FA") : "#fff5f5" }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: ortak.uygun ? brand.ink : brand.red }}>
                {ortak.uygun
                  ? t({ tr: "✓ Ortak kesim birleşik yükü karşılıyor", en: "✓ Shared section carries the combined load", de: "✓ Gemeinsamer Abschnitt trägt die kombinierte Last" })
                  : t({ tr: "⚠ Ortak kesim AŞIRI YÜKLÜ", en: "⚠ Shared section OVERLOADED", de: "⚠ Gemeinsamer Abschnitt ÜBERLASTET" })}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: ortak.uygun ? brand.muted : brand.red }}>{ortak.ozet}</p>
          </div>
        )}
        {subeler.some((s) => (s.servisTren ?? 0) > 0) && !ortak.aktif && (
          <p className="mt-3 text-xs" style={{ color: brand.muted }}>{ortak.ozet}</p>
        )}

        <button disabled={!yazilabilir} onClick={subeEkle}
          className="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: brand.ink }}>{t({ tr: "+ Şube ekle", en: "+ Add branch", de: "+ Zweigstrecke hinzufügen" })}</button>
      </div>
    </details>
  );
}
