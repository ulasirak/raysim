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

const TIP_AD: Record<string, string> = { korTerminal: "kör terminal", ciftPeron: "çift peron", dongu: "balon loop", makasliGecis: "makaslı geçiş" };

export function TurnbackKapasite({ terminalBas, terminalSon, cfg }: { terminalBas: TerminalConfig; terminalSon: TerminalConfig; cfg: SimConfig }) {
  const bas = terminalOlc(terminalBas, cfg);
  const son = terminalOlc(terminalSon, cfg);
  const bagBas = bas.hw >= son.hw && bas.hw > 0; // daha yüksek headway = bağlayan uç

  const kart = (ad: string, t: TerminalConfig, o: ReturnType<typeof terminalOlc>, bag: boolean) => {
    const makasMetin = [o.mk.s > 0 ? `${o.mk.s} S-makas` : "", o.mk.x > 0 ? `${o.mk.x} X-makas` : ""].filter(Boolean).join(" + ") || "makas yok";
    return (
      <div className="rounded-lg border p-3" style={{ borderColor: bag ? CK.red : brand.border, background: bag ? "#FDF3F4" : "#fff" }}>
        <div className="flex items-baseline justify-between">
          <div className="font-semibold" style={{ color: brand.ink }}>{ad}</div>
          <div className="text-xs" style={{ color: brand.muted }}>{TIP_AD[t.tip] || t.tip}</div>
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: bag ? CK.red : brand.ink }}>
          {o.kap === Infinity ? "∞" : Math.round(o.kap)} <span className="text-sm font-medium" style={{ color: brand.muted }}>tramvay/saat</span>
        </div>
        <div className="mt-0.5 text-xs" style={{ color: brand.muted }}>dönüş headway {o.hw > 0 ? `${Math.round(o.hw)} s` : "—"} {bag ? <b style={{ color: CK.red }}>← bağlayan uç</b> : ""}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs" style={{ color: brand.inkSoft }}>
          <span>Makas: <b>{makasMetin}</b></span>
          <span>Peron: <b>{o.peron}</b></span>
          <span>Peron başı: <b>{o.peronBasi > 0 ? `${Math.round(o.peronBasi)} s` : "—"}</b></span>
          <span>Boğaz{o.seri ? " (2×seri)" : ""}: <b>{o.bogaz > 0 ? `${Math.round(o.bogaz)} s` : "—"}</b></span>
        </div>
        {o.hw > 0 && <div className="mt-1 text-xs" style={{ color: o.bagAlt === "boğaz" ? CK.amberInk : brand.muted }}>Alt-etken: <b>{o.bagAlt === "peron" ? "peron işgali" : "boğaz (makas) geçişi"}</b> baskın</div>}
      </div>
    );
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kart("Başlangıç terminali", terminalBas, bas, bagBas)}
        {kart("Bitiş terminali", terminalSon, son, !bagBas && son.hw > 0)}
      </div>
      <div className="mt-2 text-xs" style={{ color: brand.muted }}>
        Turnback kapasitesi = 3600 ÷ dönüş headway. Headway = max(peron başı işgali, boğaz/makas geçişi). <b>S-makas</b>ta varış+kalkış aynı boğazı seri kullanır (2×); <b>X-makas</b>/çift peronda ayrı bacak (1×) → daha yüksek kapasite. Boğaz baskınsa X-makas ekle; peron baskınsa peron/çift-peron ekle. Bağlayan uç hattın terminal kapasitesini belirler.
      </div>
    </div>
  );
}
