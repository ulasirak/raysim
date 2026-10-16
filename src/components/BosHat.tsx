"use client";

// raysim — BOŞ HAT durumu.
// Yeni bir hesap (veya yeni açılan hat) sıfırdan başlar: ring yoktur, dolayısıyla
// simülasyon/kapasite/belge modüllerinin hesaplayacağı bir şey de yoktur. Sahte
// bir örnek hat göstermek yerine kullanıcıyı hattı kurmaya yönlendiririz.
//
// GEZİNME: Uygulama tek-uzun-sayfadır; modüller eski `/ringler` derin rotaları değil,
// aynı sayfadaki bölüm ankorlarıdır. Bu yüzden Link yerine panelAcVeGit(slug) ile
// bölüme kaydırırız (yapışkan menü payı + gizli sekme/çekmece açma dahil).

import { brand } from "@/lib/anaray/brand";
import { useDil } from "@/components/DilProvider";
import { panelAcVeGit } from "@/lib/anaray/panelGezinme";

export function BosHat({ modul }: { modul: string }) {
  const { t } = useDil();

  // Boru hattı sırasıyla (KUR → ANALİZ): önce Ringler'de hattı kur, sonra Sefer'de simüle et.
  const ADIMLAR: { no: string; ad: string; slug: string; aciklama: string }[] = [
    {
      no: "1",
      ad: t({ tr: "Durak Arası Ringler", en: "Inter-Stop Cells", de: "Streckenabschnitte" }),
      slug: "ringler",
      aciklama: t({
        tr: "Durak arası hücreleri (mesafe, dwell, makas, hemzemin) ekleyin — hattın omurgası. GTFS / railML / DXF içe aktarabilir ya da coğrafi koordinattan üretebilirsiniz.",
        en: "Add the inter-stop cells (distance, dwell, switch, level crossing) — the spine of the line. You can import GTFS / railML / DXF or generate from geographic coordinates.",
        de: "Fügen Sie die Streckenabschnitte hinzu (Entfernung, Haltezeit, Weiche, Bahnübergang) — das Rückgrat der Linie. Sie können GTFS / railML / DXF importieren oder aus geografischen Koordinaten erzeugen.",
      }),
    },
    {
      no: "2",
      ad: t({ tr: "Sefer Simülasyonu", en: "Service Simulation", de: "Betriebssimulation" }),
      slug: "sefer",
      aciklama: t({
        tr: "Kurduğunuz hattı simüle edin: hız, ivme, sefer aralığı ve zamanlayıcı parametreleriyle canlı ağ, kapasite ve darboğazlar.",
        en: "Simulate the line you built: live network, capacity and bottlenecks with speed, acceleration, headway and timetable parameters.",
        de: "Simulieren Sie die aufgebaute Linie: Live-Netz, Kapazität und Engpässe mit Geschwindigkeit, Beschleunigung, Zugfolgezeit und Fahrplanparametern.",
      }),
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <div className="rounded-lg border bg-white p-8" style={{ borderColor: brand.border }}>
        <div className="field-label">{t({ tr: "Hat henüz boş", en: "Line is still empty", de: "Strecke ist noch leer" })}</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>
          {t({ tr: "önce hattınızı tanımlayın", en: "define your line first", de: "definieren Sie zuerst Ihre Strecke" })} <span style={{ textTransform: "none" }}>({modul})</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: brand.muted }}>
          {t({ tr: "Bu hesapta kayıtlı bir durak/ring bulunmuyor. RaySim hazır bir örnek hat varsaymaz — sonuçların sizin projenize ait olması için verileri siz girersiniz.", en: "No station/section is saved on this account. RaySim assumes no ready-made sample line — you enter the data yourself so the results belong to your project.", de: "Für dieses Konto ist keine Haltestelle/kein Abschnitt gespeichert. RaySim nimmt keine vorgefertigte Beispielstrecke an — Sie geben die Daten selbst ein, damit die Ergebnisse zu Ihrem Projekt gehören." })}
        </p>

        <ol className="mt-6 flex flex-col gap-3">
          {ADIMLAR.map(({ no, ad, slug, aciklama }) => (
            <li key={slug} className="flex gap-3 rounded-md border px-4 py-3" style={{ borderColor: brand.border }}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: brand.ink }}>{no}</span>
              <div className="min-w-0">
                <button type="button" onClick={() => panelAcVeGit(slug, brand.red)}
                  className="text-sm font-semibold underline" style={{ color: brand.red }}>{ad}</button>
                <p className="text-xs leading-relaxed" style={{ color: brand.muted }}>{aciklama}</p>
              </div>
            </li>
          ))}
        </ol>

        <button type="button" onClick={() => panelAcVeGit("ringler", brand.red)}
          className="mt-6 inline-block rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: brand.red }}>
          {t({ tr: "İlk ringi eklemeye başla →", en: "Start adding the first section →", de: "Ersten Abschnitt hinzufügen →" })}
        </button>
      </div>
    </div>
  );
}
