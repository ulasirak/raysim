# RaySim — Demiryolu Ağı Simülasyon Sistemi

Mikroskobik tren hareketi, sinyalizasyon ve kapasite analizi için web tabanlı
demiryolu simülasyon platformu. Blocking-time (Sperrzeitentreppe) ve UIC 406 metodolojisine
dayanan bağımsız çekirdek.

**Canlı:** https://raysim.vercel.app

📖 **Teknik dokümantasyon:** [`docs/README.md`](docs/README.md) — mimari, fizik motoru, sinyalizasyon, kapasite yöntemleri, veri modeli, dağıtım.

## Modüller

1. **Durak Arası Ringler** — işletim hücreleri · makas/hemzemin/tehlike kısıtları · worst/best · loop
2. **Sefer Simülasyonu** — canlı ağ · fizik · headway · sabit/hareketli blok · kapasite
3. **Sistem Merkezi** — parametreler · canlı durum · Sperrzeitentreppe · blocking-time
4. **Teknik Belgeler** — PDF/Word/Excel tasarım el kitabı üretimi

## Teknik

- **Fizik:** Davis direnci, eğim, P/v çekiş sınırı, önden fren eğrisi
- **Sinyalizasyon:** sabit blok + hareketli blok (CBTC), makas bölgesi kısıtları, tren-boyu işgal
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
