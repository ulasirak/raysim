# RaySim — Demiryolu Ağı Simülasyon Sistemi

Mikroskobik tren hareketi, sinyalizasyon/anklaşman ve kapasite analizi için web tabanlı
demiryolu simülasyon platformu. Blocking-time (Sperrzeitentreppe) ve UIC 406 metodolojisine
dayanan bağımsız çekirdek.

**Canlı:** https://turkray-eight.vercel.app

📖 **Teknik dokümantasyon:** [`docs/README.md`](docs/README.md) — mimari, fizik motoru, sinyalizasyon, kapasite yöntemleri, veri modeli, dağıtım.

## Modüller

1. **Sefer Simülasyonu** — ağ · fizik · headway · kapasite
2. **Durak Arası Ringler** — işletim hücreleri · worst/best · loop
3. **Makas Bölgesi Anklaşman** — interlocking · çakışma matriksi · aspekt
4. **Tam Hat Simülasyonu** — ring + anklaşman · çok tren · sabit/hareketli blok · kapasite mutabakatı
5. **Sistem Merkezi** — parametreler · canlı durum · Sperrzeitentreppe
6. **Teknik Belgeler** — Word + Excel tasarım el kitabı üretimi

## Teknik

- **Fizik:** Davis direnci, eğim, P/v çekiş sınırı, önden fren eğrisi
- **Sinyalizasyon:** sabit blok + hareketli blok (CBTC), dağıtık interlocking, tren-boyu işgal
- **Kapasite:** blocking-time (6 bileşen), UIC 406, Monte-Carlo gecikme yayılımı, enerji + regen
- **Yığın:** Next.js 16 · React 19 · Tailwind v4 · TypeScript · Firebase (Firestore + Auth)

## Geliştirme

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

Firebase yapılandırması `.env.local` içinde (`.env.example` şablonundan). Canlı senaryo
yayınlamak için yönetici girişi (Email/Password) gerekir; ziyaretçiler salt-okunur.
