"use client";

// raysim — TERMİNAL TURNBACK KAPASİTESİ: her uçtaki dönüş (turnback) kapasitesini makas
// geometrisinden (S/X sayısı), peron sayısından ve boğaz işgalinden hesaplar. Tramvay
// hatlarında hattın kapasitesini çoğu kez TERMİNAL dönüşü bağlar → bu görsel iki ucu
// yan yana koyup hangisinin (ve hangi alt-etkenin: peron mu boğaz mı) bağladığını gösterir.

import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import {
  terminalMakasSayilari, etkinPeronSayisi, etkinBogazIsgali, terminalDonusParalel,
  terminalSeriDonus, type TerminalConfig, type SimConfig,
} from "@/lib/anaray/config";
import { terminalHeadway } from "@/lib/anaray/kapasite";
import { useDil } from "@/components/DilProvider";
import Link from "next/link";

function terminalOlc(t: TerminalConfig, cfg: SimConfig) {
  const mk = terminalMakasSayilari(t);
  const peron = etkinPeronSayisi(t);
  const paralel = terminalDonusParalel(t);
  const hw = terminalHeadway(t, cfg);
  const peronBasi = t.tip === "dongu" ? 0 : (t.peronIsgali || 0) / Math.max(1, paralel);
  const bogaz = t.tip === "dongu" ? 0 : (terminalSeriDonus(t) ? 2 : 1) * etkinBogazIsgali(t, cfg);
  const kap = hw > 0 ? 3600 / hw : Infinity;
  return { mk, peron, paralel, hw, peronBasi, bogaz, kap, bagAlt: peronBasi >= bogaz ? "peron" : "boğaz" as "peron" | "boğaz", seri: terminalSeriDonus(t) };
}

// Terminal tipi etiketleri — i18n (önceden yalnız TR sabitti → EN/DE'de de Türkçe basıyordu).
const TIP_AD: Record<string, { tr: string; en: string; de: string }> = {
  korTerminal: { tr: "kör terminal", en: "stub terminal", de: "Kopfendstelle" },
  ciftPeron: { tr: "çift peron", en: "double platform", de: "Doppelbahnsteig" },
  dongu: { tr: "balon loop", en: "balloon loop", de: "Gleisschleife" },
  makasliGecis: { tr: "makaslı geçiş", en: "crossover", de: "Gleiswechsel" },
};

export function TurnbackKapasite({ terminalBas, terminalSon, cfg }: { terminalBas: TerminalConfig; terminalSon: TerminalConfig; cfg: SimConfig }) {
  const { t } = useDil();
  const bas = terminalOlc(terminalBas, cfg);
  const son = terminalOlc(terminalSon, cfg);
  const bagBas = bas.hw >= son.hw && bas.hw > 0; // daha yüksek headway = bağlayan uç

  const kart = (ad: string, tc: TerminalConfig, o: ReturnType<typeof terminalOlc>, bag: boolean) => {
    const makasMetin = [o.mk.s > 0 ? `${o.mk.s} S-makas` : "", o.mk.x > 0 ? `${o.mk.x} X-makas` : ""].filter(Boolean).join(" + ") || t({ tr: "makas yok", en: "no switches", de: "keine Weichen" });
    return (
      <div className="rounded-lg border p-3" style={{ borderColor: bag ? CK.red : brand.border, background: bag ? "#FDF3F4" : "#fff" }}>
        <div className="flex items-baseline justify-between">
          <div className="font-semibold" style={{ color: brand.ink }}>{ad}</div>
          <div className="text-xs" style={{ color: brand.muted }}>{TIP_AD[tc.tip] ? t(TIP_AD[tc.tip]) : tc.tip}</div>
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: bag ? CK.red : brand.ink }}>
          {o.kap === Infinity ? "∞" : Math.round(o.kap)} <span className="text-sm font-medium" style={{ color: brand.muted }}>{t({ tr: "tramvay/saat", en: "trams/hour", de: "Tram/Std" })}</span>
        </div>
        <div className="mt-0.5 text-xs" style={{ color: brand.muted }}>{t({ tr: "dönüş headway ", en: "turnback headway ", de: "Wende-Zugfolgezeit " })}{o.hw > 0 ? `${Math.round(o.hw)} s` : "—"} {bag ? <b style={{ color: CK.red }}>{t({ tr: "← bağlayan uç", en: "← governing end", de: "← maßgebendes Ende" })}</b> : ""}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs" style={{ color: brand.inkSoft }}>
          <span>{t({ tr: "Makas: ", en: "Switches: ", de: "Weichen: " })}<b>{makasMetin}</b></span>
          <span>{t({ tr: "Peron: ", en: "Platform: ", de: "Bahnsteig: " })}<b>{o.peron}</b></span>
          <span>{t({ tr: "Peron başı: ", en: "Per platform: ", de: "Pro Bahnsteig: " })}<b>{o.peronBasi > 0 ? `${Math.round(o.peronBasi)} s` : "—"}</b></span>
          <span>{t({ tr: "Boğaz", en: "Throat", de: "Halsbereich" })}{o.seri ? t({ tr: " (2×seri)", en: " (2×series)", de: " (2×seriell)" }) : ""}: <b>{o.bogaz > 0 ? `${Math.round(o.bogaz)} s` : "—"}</b></span>
        </div>
        {o.hw > 0 && <div className="mt-1 text-xs" style={{ color: o.bagAlt === "boğaz" ? CK.amberInk : brand.muted }}>{t({ tr: "Alt-etken: ", en: "Sub-factor: ", de: "Teilfaktor: " })}<b>{o.bagAlt === "peron" ? t({ tr: "peron işgali", en: "platform occupancy", de: "Bahnsteigbelegung" }) : t({ tr: "boğaz (makas) geçişi", en: "throat (switch) transit", de: "Halsbereich-(Weichen-)Durchfahrt" })}</b>{t({ tr: " baskın", en: " dominant", de: " maßgebend" })}</div>}
      </div>
    );
  };

  // Özet: hattı bağlayan (daha düşük kapasiteli) uç + baskın alt-etken — tek bakışta sonuç.
  const bagO = bagBas ? bas : son;
  const bagAd = bagBas ? t({ tr: "Başlangıç terminali", en: "Start terminal", de: "Startendstelle" }) : t({ tr: "Bitiş terminali", en: "End terminal", de: "Zielendstelle" });
  const bagKap = bagO.kap === Infinity ? "∞" : `${Math.round(bagO.kap)}`;
  const bagAltMetin = bagO.bagAlt === "peron"
    ? t({ tr: "peron işgali", en: "platform occupancy", de: "Bahnsteigbelegung" })
    : t({ tr: "boğaz (makas) geçişi", en: "throat (switch) transit", de: "Halsbereich-(Weichen-)Durchfahrt" });

  return (
    <div>
      {/* Özet şeridi — hattı bağlayan uç + kapasitesi + baskın alt-etken */}
      <div className="mb-3 rounded-md border-l-4 px-3 py-2 text-sm" style={{ borderColor: CK.red, background: "#FDF3F4", color: brand.inkSoft }}>
        <b style={{ color: brand.ink }}>{t({ tr: "Hattı bağlayan uç:", en: "Governing end:", de: "Maßgebendes Ende:" })}</b> {bagAd} · <b style={{ color: CK.red }}>{bagKap} {t({ tr: "tramvay/saat", en: "trams/hour", de: "Tram/Std" })}</b>{bagO.hw > 0 ? <> · {t({ tr: "baskın alt-etken", en: "dominant sub-factor", de: "maßgebender Teilfaktor" })}: <b>{bagAltMetin}</b></> : ""}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kart(t({ tr: "Başlangıç terminali", en: "Start terminal", de: "Startendstelle" }), terminalBas, bas, bagBas)}
        {kart(t({ tr: "Bitiş terminali", en: "End terminal", de: "Zielendstelle" }), terminalSon, son, !bagBas && son.hw > 0)}
      </div>
      <div className="mt-2 text-xs" style={{ color: brand.muted }}>
        {t({ tr: "Turnback kapasitesi = 3600 ÷ dönüş headway. Headway = max(peron başı işgali, boğaz/makas geçişi). ", en: "Turnback capacity = 3600 ÷ turnback headway. Headway = max(platform occupancy, throat/switch transit). ", de: "Wendekapazität = 3600 ÷ Wende-Zugfolgezeit. Zugfolgezeit = max(Bahnsteigbelegung, Halsbereich-/Weichendurchfahrt). " })}<b>S-makas</b>{t({ tr: "ta varış+kalkış aynı boğazı seri kullanır (2×); ", en: ": arrival+departure use the same throat in series (2×); ", de: ": Ankunft+Abfahrt nutzen denselben Halsbereich seriell (2×); " })}<b>X-makas</b>{t({ tr: "/çift peronda ayrı bacak (1×) → daha yüksek kapasite. Boğaz baskınsa X-makas ekle; peron baskınsa peron/çift-peron ekle. Bağlayan uç hattın terminal kapasitesini belirler.", en: "/double platform use a separate leg (1×) → higher capacity. If the throat governs, add an X-switch; if the platform governs, add a platform/second platform. The governing end sets the line's terminal capacity.", de: "/Doppelbahnsteig nutzen einen separaten Schenkel (1×) → höhere Kapazität. Bestimmt der Halsbereich, füge eine X-Weiche hinzu; bestimmt der Bahnsteig, füge einen (zweiten) Bahnsteig hinzu. Das maßgebende Ende bestimmt die Endstellenkapazität der Linie." })}
      </div>
      <div className="mt-2 text-xs" style={{ color: brand.muted }}>
        {t({ tr: "Her iki ucun tam dökümü (terminal · makas · peron · dönüş headway · kapasite · baskın alt-etken) tablo olarak ", en: "The full breakdown of both ends (terminal · switch · platform · turnback headway · capacity · dominant sub-factor) is produced as a table in ", de: "Die vollständige Aufschlüsselung beider Enden (Endstelle · Weiche · Bahnsteig · Wende-Zugfolgezeit · Kapazität · maßgebender Teilfaktor) wird als Tabelle erzeugt in " })}
        <Link href="/#belgeler" className="font-semibold underline" style={{ color: brand.red }}>{t({ tr: "Teknik Belgeler → PDF raporu (Kapasite bölümü)", en: "Technical Documents → PDF report (Capacity section)", de: "Technische Dokumente → PDF-Bericht (Kapazitätsabschnitt)" })}</Link>
        {t({ tr: " içinde üretilir.", en: ".", de: "." })}
      </div>
    </div>
  );
}
