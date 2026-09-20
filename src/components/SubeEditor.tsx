"use client";

// raysim — ŞUBE / TALİ HAT EDİTÖRÜ (dallanma, #1)
// Ana hat (rings) AYNEN kalır; buradan ana hattın bir DURAĞINDAN (kavşak) ayrılan
// şubeler eklenir/düzenlenir. Şube kendi durak-arası zinciridir. Kalıcı: projeye
// (subeler) kaydedilir; Sefer/Canlı Ağ şubeyi grafik ağda gösterir, şube rotası
// ayrı analiz edilebilir.

import { useMemo } from "react";
import { useProje } from "@/components/SimConfigProvider";
import { brand } from "@/lib/anaray/brand";
import { BosDurum } from "@/components/BosDurum";
import { ringDuraklari, yeniSube, yeniRing, type Sube } from "@/lib/anaray/ring";

export function SubeEditor() {
  const { rings, subeler, setSubeler, yazilabilir } = useProje();
  const duraklar = useMemo(() => ringDuraklari(rings), [rings]);

  if (rings.length === 0) return null;

  const guncelle = (id: string, p: Partial<Sube>) =>
    setSubeler((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const ringGuncelle = (sid: string, ridx: number, p: Partial<{ toAd: string; uzunluk: number }>) =>
    setSubeler((ss) => ss.map((s) => (s.id === sid
      ? { ...s, rings: s.rings.map((r, i) => (i === ridx ? { ...r, ...p } : r)) }
      : s)));
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
  const subeEkle = () => setSubeler((ss) => [...ss, yeniSube(Math.min(duraklar.length - 1, Math.max(0, duraklar.length - 1)), `Şube ${ss.length + 1}`)]);
  const subeSil = (id: string) => setSubeler((ss) => ss.filter((s) => s.id !== id));

  const inp = "rounded border px-2 py-1 text-sm";
  const inpStyle = { borderColor: brand.border, color: brand.ink };

  return (
    <details className="mt-4 rounded-lg border bg-white" style={{ borderColor: brand.border }}>
      <summary className="flex cursor-pointer select-none items-center gap-2 p-4">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>Şubeler / Tali Hatlar (Dallanma)</span>
        <span className="ml-2 text-xs" style={{ color: brand.muted }}>{subeler.length ? `${subeler.length} şube` : "ana hattan ayrılan tali hat ekle"}</span>
      </summary>
      <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: brand.border }}>
        <p className="mb-3 text-xs" style={{ color: brand.muted }}>
          Şube, <b>ana hattın bir durağından (kavşak)</b> ayrılan tali hattır. Ana hat değişmez.
          Şube grafik ağda görünür ve Sefer'de rotası ayrı analiz edilebilir (kapasite/Bildfahrplan).
        </p>

        {subeler.length === 0 && (
          <div className="mb-3">
            <BosDurum sik baslik="Henüz şube yok" ipucu="Aşağıdan bir durağı kavşak seçip tali hat ekleyin." />
          </div>
        )}

        <div className="space-y-4">
          {subeler.map((s) => (
            <div key={s.id} className="rounded-md border p-3" style={{ borderColor: brand.borderStrong }}>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs" style={{ color: brand.inkSoft }}>
                  Şube adı
                  <input disabled={!yazilabilir} value={s.ad} onChange={(e) => guncelle(s.id, { ad: e.target.value })}
                    className={`${inp} ml-2 w-44`} style={inpStyle} />
                </label>
                <label className="text-xs" style={{ color: brand.inkSoft }}>
                  Kavşak (ayrılma durağı)
                  <select disabled={!yazilabilir} value={s.atIndex}
                    onChange={(e) => guncelle(s.id, { atIndex: +e.target.value })}
                    className={`${inp} ml-2`} style={inpStyle}>
                    {duraklar.map((d, i) => <option key={i} value={i}>{i + 1}. {d.ad}</option>)}
                  </select>
                </label>
                <label className="text-xs" style={{ color: brand.inkSoft }} title="Bu kola giden tren sayısı. Girilirse ortak kesim (hat başı→kavşak) birleşik yükü hesaplanır. 0/boş = kapalı (tahmin yok).">
                  Servis treni
                  <input disabled={!yazilabilir} type="number" min={0} max={99} value={s.servisTren ?? 0}
                    onChange={(e) => guncelle(s.id, { servisTren: Math.max(0, Math.min(99, +e.target.value || 0)) })}
                    className={`${inp} ml-2 w-20`} style={inpStyle} />
                </label>
                <button disabled={!yazilabilir} onClick={() => subeSil(s.id)}
                  className="ml-auto rounded border px-3 py-1 text-xs font-semibold disabled:opacity-40"
                  style={{ borderColor: brand.red, color: brand.red }}>Şubeyi sil</button>
              </div>

              {/* Şube durakları */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: brand.muted }}>
                      <th className="px-1 py-1 text-left text-xs font-medium">#</th>
                      <th className="px-1 py-1 text-left text-xs font-medium">Durak adı</th>
                      <th className="px-1 py-1 text-left text-xs font-medium">Önceki duraktan mesafe (m)</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex gap-2">
                <button disabled={!yazilabilir} onClick={() => durakEkle(s.id)}
                  className="rounded border px-3 py-1 text-xs font-semibold disabled:opacity-40"
                  style={{ borderColor: brand.borderStrong, color: brand.ink }}>+ Durak ekle</button>
                <button disabled={!yazilabilir || s.rings.length <= 1} onClick={() => durakSil(s.id)}
                  className="rounded border px-3 py-1 text-xs font-semibold disabled:opacity-40"
                  style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>− Son durağı sil</button>
              </div>
            </div>
          ))}
        </div>

        <button disabled={!yazilabilir} onClick={subeEkle}
          className="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: brand.ink }}>+ Şube ekle</button>
      </div>
    </details>
  );
}
