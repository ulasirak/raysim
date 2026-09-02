"use client";

// raysim — GİRİŞ / KAYIT ekranı.
// Klasik akış, üç durum: [Giriş] · [Kayıt ol] · [Şifremi unuttum].
// E-posta doğrulama adımı YOKTUR — kayıt biter bitmez oturum açılır ve kullanıcı
// doğrudan içeri girer (bkz. AuthProvider.kayitOl).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, authHata } from "@/components/AuthProvider";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

type Mod = "giris" | "kayit" | "sifre";

const BASLIK: Record<Mod, string> = {
  giris: "Giriş yap",
  kayit: "Hesap oluştur",
  sifre: "Şifremi unuttum",
};

const BUTON: Record<Mod, string> = {
  giris: "Giriş yap",
  kayit: "Hesabı oluştur",
  sifre: "Sıfırlama bağlantısı gönder",
};

/**
 * `kapiModu`: ekran, sitenin girişinde (Kapi içinde) gösteriliyor demektir —
 * kendi rotası olmadığı için giriş başarılı olunca YÖNLENDİRME yapılmaz;
 * oturum açılır açılmaz kapı ardındaki modüller aynı yolda görünür.
 */
export function GirisEkrani({ kapiModu = false }: { kapiModu?: boolean } = {}) {
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

  // Auth → içerik geçişinin TEK kaynağı: oturum açılınca ana sayfaya götür.
  // Hem taze giriş/kayıt (girisYap sonrası `user` güncellenince) hem de girişliyken
  // /giris'e gelme durumunu kapsar. Kapı modunda yönlendirme YOK — sayfa yerinde
  // açılır (Kapi çocukları aynı yolda gösterir). `gonder` ayrıca redirect ETMEZ:
  // tek yol bu effect → çift yönlendirme / yarış olmaz.
  useEffect(() => {
    if (!kapiModu && hazir && user) router.replace("/");
  }, [kapiModu, hazir, user, router]);

  const modDegistir = (m: Mod) => { setMod(m); setMesaj(null); };

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setMesgul(true); setMesaj(null);
    try {
      if (mod === "giris") {
        await girisYap(eposta, sifre); // başarılıysa yukarıdaki effect yönlendirir
      } else if (mod === "kayit") {
        // Kayıt anında oturum açar: ek onay ekranı yok, doğrudan içeri.
        await kayitOl(eposta, sifre);
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
    <div className="mx-auto flex max-w-md flex-col px-6 py-14">
      {/* Amblem + ürün adı — ekranın kime ait olduğu tek bakışta belli olsun */}
      <div className="mb-6 flex flex-col items-center gap-2">
        <svg width="44" height="44" viewBox="0 0 46 46" fill="none" aria-hidden="true">
          <circle cx="23" cy="23" r="21.5" stroke={brand.gold} strokeWidth="1" />
          <circle cx="23" cy="23" r="18" stroke={brand.borderStrong} strokeWidth="1" />
          <path d="M17 34 L21.5 13 M29 34 L24.5 13" stroke={brand.ink} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M18.4 28 L27.6 28 M19.3 24 L26.7 24 M20 20.5 L26 20.5 M20.7 17.5 L25.3 17.5" stroke={brand.red} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="font-brand text-lg font-semibold tracking-[0.15em]" style={{ color: brand.ink }}>RaySim</span>
      </div>

      <div className="rounded-lg border p-7" style={{ background: brand.surface, borderColor: brand.border }}>
        <h1 className="font-brand text-xl font-semibold" style={{ color: brand.ink }}>{BASLIK[mod]}</h1>
        <p className="mt-1 text-sm" style={{ color: brand.muted }}>
          {mod === "sifre"
            ? "E-posta adresinizi girin, sıfırlama bağlantısı gönderelim."
            : "Demiryolu Ağı Simülasyon Sistemi"}
        </p>

        {!yapilandirildi ? (
          <div className="mt-5 rounded-md border-l-4 px-4 py-3 text-sm" style={{ background: CK.badBgSoft, borderColor: brand.red, color: brand.ink }}>
            ⚠ Firebase yapılandırılmadı — <span className="font-mono">.env.local</span> içindeki
            <span className="font-mono"> NEXT_PUBLIC_FIREBASE_*</span> değerleri girilmeden hesap açılamaz.
          </div>
        ) : (
          <>
            <form onSubmit={gonder} className="mt-5 flex flex-col gap-3">
              <label className="block">
                <span className="field-label">E-posta</span>
                <input type="email" required value={eposta} onChange={(e) => setEposta(e.target.value)}
                  autoComplete="email" autoFocus placeholder="ad@firma.com"
                  className="mt-1 w-full rounded border px-3 py-2 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              </label>

              {mod !== "sifre" && (
                <label className="block">
                  <span className="field-label">Şifre</span>
                  <input type="password" required value={sifre} onChange={(e) => setSifre(e.target.value)}
                    autoComplete={mod === "kayit" ? "new-password" : "current-password"} minLength={6}
                    placeholder={mod === "kayit" ? "en az 6 karakter" : "••••••••"}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                </label>
              )}

              <button type="submit" disabled={mesgul}
                className="mt-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: brand.red }}>
                {mesgul ? "…" : BUTON[mod]}
              </button>
            </form>

            {mesaj && (
              <p className="mt-3 text-sm" style={{ color: mesaj.tip === "err" ? brand.red : CK.good }}>
                {mesaj.tip === "err" ? "⚠ " : "✓ "}{mesaj.metin}
              </p>
            )}

            {/* Alt bağlantılar — yalnız o modun çıkışları görünür */}
            <div className="mt-5 border-t pt-4 text-sm" style={{ borderColor: brand.border, color: brand.muted }}>
              {mod === "giris" && (
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => modDegistir("kayit")} className="font-medium underline" style={{ color: brand.ink }}>
                    Hesap oluştur
                  </button>
                  <button type="button" onClick={() => modDegistir("sifre")} className="underline">
                    Şifremi unuttum
                  </button>
                </div>
              )}
              {mod === "kayit" && (
                <div className="flex items-center justify-between">
                  <span>Hesabınız var mı?</span>
                  <button type="button" onClick={() => modDegistir("giris")} className="font-medium underline" style={{ color: brand.ink }}>
                    Giriş yap
                  </button>
                </div>
              )}
              {mod === "sifre" && (
                <button type="button" onClick={() => modDegistir("giris")} className="underline">← Girişe dön</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
