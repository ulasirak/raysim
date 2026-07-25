// raysim — resmî künye başlığı (masthead).
// Koyu mürekkep zemin + amblem (ray rozeti) + Spectral marka. Sağ tarafta bir
// SLOT (`sag`) taşır: girişliyken hesap/hat kontrolleri (HesapKontrolleri) buraya
// gömülür; girişsizken slot boştur ve header yalnız marka ile sade kalır.

export function Masthead({ sag }: { sag?: React.ReactNode }) {
  return (
    <header className="border-b-2" style={{ background: "#0C2233", borderColor: "#C8102E" }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
        {/* Amblem: iki rayın ufka doğru birleşmesi (mühür) */}
        <span className="shrink-0" aria-hidden="true">
          <svg width="46" height="46" viewBox="0 0 46 46" fill="none">
            <circle cx="23" cy="23" r="21.5" stroke="#A8842C" strokeWidth="1" />
            <circle cx="23" cy="23" r="18" stroke="#E7ECF1" strokeWidth="1" opacity="0.5" />
            {/* raylar */}
            <path d="M17 34 L21.5 13 M29 34 L24.5 13" stroke="#E7ECF1" strokeWidth="1.6" strokeLinecap="round" />
            {/* traversler */}
            <path d="M18.4 28 L27.6 28 M19.3 24 L26.7 24 M20 20.5 L26 20.5 M20.7 17.5 L25.3 17.5"
              stroke="#C8102E" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>

        {/* Marka + alt başlık */}
        <div className="min-w-0 shrink-0">
          <div className="font-brand text-2xl font-semibold leading-none tracking-[0.15em] text-white">
            RaySim
          </div>
          <div className="mt-1.5 text-[0.7rem] uppercase tracking-[0.22em] text-slate-300">
            Demiryolu Ağı Simülasyon Sistemi
          </div>
        </div>

        {/* Sağ slot: hesap/hat kontrolleri (girişsizken boş) */}
        {sag && (
          <div className="ml-auto flex min-w-0 items-center justify-end border-l border-white/15 pl-4">
            {sag}
          </div>
        )}
      </div>
    </header>
  );
}
