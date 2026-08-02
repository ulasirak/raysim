# RaySim — Demiryolu Ağı Simülasyon Sistemi

Mikroskobik tren hareketi, sinyalizasyon ve kapasite analizi için web tabanlı,
**çok-kiracılı** demiryolu simülasyon platformu. Blocking-time
(Sperrzeitentreppe) ve UIC 406 metodolojisine dayanan bağımsız fizik + sinyal
çekirdeği; her hesap kendi hatlarını kurar, analiz eder ve baskıya hazır teknik
rapor üretir.

**Canlı:** https://raysim.vercel.app

📖 **Teknik dokümantasyon:** [`docs/README.md`](docs/README.md) — mimari, fizik
motoru, sinyalizasyon, kapasite yöntemleri, veri modeli, güvenlik kuralları,
dağıtım.

---

## Akış — KUR → ANALİZ → BELGELE

Sayfa sırası bir mühendislik iş akışını izler; üstte faz göstergesi ilerlemeyi
gösterir.

| Faz | Modül | Kod | İçerik |
|-----|-------|-----|--------|
| **KUR** | Durak Arası Ringler | SR-0001 | Duraklar & mesafeler · durak-arası hücreler · makas/hemzemin/tehlike kısıtları · worst/best · loop (çevrim) |
| **ANALİZ** | Sefer Simülasyonu | SR-0002 | Canlı ağ · fizik · headway · sabit/hareketli blok · kapasite |
| **ANALİZ** | Sistem Merkezi | SR-0003 | Parametreler · canlı durum · Sperrzeitentreppe · blocking-time · teşhis |
| **BELGELE** | Teknik Belgeler | SR-0004 | Ücretli PDF rapor · düzenlenebilir Word/Excel tasarım el kitabı |

## Hesap modeli — anonim, çok-kiracılı

- **Self-servis kayıt** (Firebase Auth, e-posta/şifre). Fabrika/varsayılan şifre
  yoktur; herkes kendi hesabını açar.
- **Hesap başına birden çok proje (hat).** Her proje Firestore'da tek bir JSON
  bloğu (`veri` alanı = `ProjeVerisi { rings, cfg, meta, arac, isletme }`) olarak
  saklanır; düzenlerken debounce'lu **otomatik kayıt** çalışır.
- **İzolasyon:** Firestore güvenlik kuralları her belgeyi sahibinin `uid`'ine
  bağlar; bir hesap başka hesabın verisini okuyamaz/yazamaz.
- **Salt-okunur paylaşım linki:** proje sahibi paylaşımı açınca herkes hattı
  görüntüler ama **düzenleyemez** (`SaltOkunurKalkan` tüm girdileri kilitler).
- Gömülü/örnek "vitrin" verisi **yoktur**; her hesap boş başlar ve hattını
  sıfırdan kurar.

## Krediler & ödeme

Ücretli eylemler önceden alınan **krediden** düşülür. Fiyatlar sunucuda tek
kaynaktan (`src/lib/cuzdan.ts`) sabittir; istemci fiyat/kredi yollayamaz.

- **Bedeller:** PDF teknik rapor = **10 kredi**, yeni hat oluşturma = **1 kredi**.
- **Paketler (KDV dâhil):** Başlangıç 10 kr / 200₺ · Standart 50 kr / 850₺ ·
  Profesyonel 100 kr / 1500₺ (1 kredi tabanı ≈ 20₺; hacimde ucuzlar).
- **Ödeme:** iyzico Checkout Form, sayfa içi **gömülü modal** (kullanıcı ödemeden
  de vazgeçip dönebilir). Kredi düşümü ve rapor üretimi **sunucuda** yapılır.

## Teknik çekirdek

- **Fizik:** Davis direnci, eğim, P/v çekiş sınırı, önden fren eğrisi
- **Sinyalizasyon:** sabit blok + hareketli blok (CBTC), makas bölgesi kısıtları,
  tren-boyu işgal
- **Kapasite:** blocking-time (6 bileşen), UIC 406, Monte-Carlo gecikme yayılımı
  (histogram + yayılım şeridi), enerji + rejeneratif geri kazanım
- **Rapor:** amblemli kapak + KPI kartları + hat şeması + blocking-time grafiği;
  site ile aynı tipografi (Geist gövde, Spectral başlık), baskıya hazır A4

## Yığın

Next.js 16.2 (App Router + Turbopack) · React 19 · Tailwind v4 · TypeScript 5.9 ·
Firebase 12 (Firestore + Auth, istemci) + firebase-admin (sunucu) · iyzico ·
Vercel.

## Proje düzeni

```
src/
  app/                 # App Router sayfaları + /api rotaları
    api/
      proje/           # ilk / olustur — hat oluşturma (kredi düşer)
      rapor/           # ücretli PDF rapor üretimi (kredi düşer)
      kredi/dus/       # sunucu-otoriteli kredi düşümü
      odeme/           # baslat / callback — iyzico
  components/          # AppShell, RingEditor, Studio, Belgeler, sağlayıcılar…
  lib/
    anaray/            # ÇEKİRDEK: fizik, sinyal, kapasite, enerji, rapor, tipler
    projeler.ts        # çok-kiracılı Firestore CRUD + paylaşım
    cuzdan*.ts          # kredi cüzdanı (istemci + sunucu-otoriteli)
    iyzico.ts          # ödeme entegrasyonu
    firebaseAdmin.ts   # sunucu tarafı Firebase (Admin SDK, lazy)
```

## Geliştirme

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production derleme
npm run lint    # ESLint
```

Firebase + iyzico yapılandırması `.env.local` içinde (`.env.example`
şablonundan). Kredi/ödeme/rapor uçları için `FIREBASE_SERVICE_ACCOUNT` (hizmet
hesabı JSON'u) gerekir; tanımsızsa bu uçlar 503 döner ve uygulama salt-okunur
çekirdek olarak çalışır.
