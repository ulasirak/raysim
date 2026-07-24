"use client";

// raysim — GİRİŞ / KAYIT ekranı (self-servis hesap).
// Her kullanıcı kendi hesabıyla girer, kendi hatlarını kurar; veriler hesap
// bazında izole edilir (bkz. firestore.rules).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, authHata } from "@/components/AuthProvider";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

type Mod = "giris" | "kayit" | "sifre";

export function GirisEkrani() {
  const router = useRouter();
  const { user, hazir, yapilandirildi, girisYap, kayitOl, sifreSifirla } = useAuth();
  const [mod, setMod] = useState<Mod>("giris");
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const [mesaj, setMesaj] = useState<{ tip: "ok" | "err"; metin: string } | null>(null);

  // URL'de ?mod=kayit varsa kayıt sekmesiyle aç (istemcide okunur).
  useEffect(() => {
    try {
      const m = new URLSearchParams(window.location.search).get("mod");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (m === "kayit") setMod("kayit");
    } catch { /* sessiz */ }
  }, []);

  // Girişliyse ana hatta gönder.
  useEffect(() => {
    if (hazir && user) router.replace("/");
  }, [hazir, user, router]);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setMesgul(true); setMesaj(null);
    try {
      if (mod === "giris") {
        await girisYap(eposta, sifre);
        router.replace("/");
      } else if (mod === "kayit") {
        await kayitOl(eposta, sifre);
        setMesaj({ tip: "ok", metin: "Hesap oluşturuldu — doğrulama postası gönderildi. Hattınız hazırlanıyor…" });
        router.replace("/");
      } else {
        await sifreSifirla(eposta);
        setMesaj({ tip: "ok", metin: "Şifre sıfırlama bağlantısı e-postanıza gönderildi." });
      }
    } catch (err) {
      setMesaj({ tip: "err", metin: authHata(err) });
    } finally {
      setMesgul(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="mb-6">
        <div className="field-label">RaySim Hesabı</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>
          {mod === "giris" ? "Giriş yap" : mod === "kayit" ? "Hesap oluştur" : "Şifremi unuttum"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: brand.muted }}>
          Her hesap kendi hatlarını kurar ve yalnız kendi verisini görür. Bir hesapta birden çok hat
          tanımlayabilir, aktif hattı üstteki çubuktan seçersiniz.
        </p>
      </div>

      {!yapilandirildi ? (
        <div className="rounded-md border-l-4 px-4 py-3 text-sm" style={{ background: CK.badBgSoft, borderColor: brand.red, color: brand.ink }}>
          ⚠ Firebase yapılandırılmadı — <span className="font-mono">.env.local</span> içindeki
          <span className="font-mono"> NEXT_PUBLIC_FIREBASE_*</span> değerleri girilmeden hesap açılamaz.
        </div>
      ) : (
        <>
          <div className="mb-4 inline-flex overflow-hidden rounded-md border" style={{ borderColor: brand.border }}>
            {([["giris", "Giriş"], ["kayit", "Kayıt"]] as [Mod, string][]).map(([m, ad]) => (
              <button key={m} onClick={() => { setMod(m); setMesaj(null); }} className="px-4 py-1.5 text-sm font-medium transition"
                style={mod === m ? { background: brand.ink, color: "#fff" } : { background: "#fff", color: brand.inkSoft }}>
                {ad}
              </button>
            ))}
          </div>

          <form onSubmit={gonder} className="flex flex-col gap-3">
            <label className="block">
              <span className="field-label">E-posta</span>
              <input type="email" required value={eposta} onChange={(e) => setEposta(e.target.value)}
                autoComplete="email" placeholder="ad@firma.com"
                className="mt-1 w-full rounded border px-3 py-2 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
            </label>

            {mod !== "sifre" && (
              <label className="block">
                <span className="field-label">Şifre</span>
                <input type="password" required value={sifre} onChange={(e) => setSifre(e.target.value)}
                  autoComplete={mod === "kayit" ? "new-password" : "current-password"} minLength={6} placeholder="en az 6 karakter"
                  className="mt-1 w-full rounded border px-3 py-2 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              </label>
            )}

            <button type="submit" disabled={mesgul}
              className="mt-1 rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: brand.red }}>
              {mesgul ? "…" : mod === "giris" ? "Giriş yap" : mod === "kayit" ? "Hesabı oluştur" : "Sıfırlama bağlantısı gönder"}
            </button>
          </form>

          {mesaj && (
            <p className="mt-3 text-sm" style={{ color: mesaj.tip === "err" ? brand.red : CK.good }}>
              {mesaj.tip === "err" ? "⚠ " : "✓ "}{mesaj.metin}
            </p>
          )}

          <div className="mt-4 flex justify-between text-xs">
            <button onClick={() => { setMod(mod === "sifre" ? "giris" : "sifre"); setMesaj(null); }} className="underline" style={{ color: brand.muted }}>
              {mod === "sifre" ? "← Girişe dön" : "Şifremi unuttum"}
            </button>
            <Link href="/" className="underline" style={{ color: brand.muted }}>Demo hattını gez →</Link>
          </div>
        </>
      )}
    </div>
  );
}
