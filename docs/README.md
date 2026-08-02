# RaySim — Sistem Dokümantasyonu

Demiryolu ağı simülasyon, sinyalizasyon ve kapasite analizi platformu.
Blocking-time (Sperrzeitentreppe) ve UIC 406 metodolojisine dayanan bağımsız çekirdek.

> Bu belge sistemin **teknik/geliştirici dokümantasyonudur** — mimari, matematik motoru,
> veri modeli ve dağıtım. Kullanıcıya dönük özet için kök `README.md`'ye bakın.

## İçindekiler

1. [Genel Bakış](#1-genel-bakış)
2. [Mimari](#2-mimari)
3. [Veri Modeli](#3-veri-modeli)
4. [Fizik Motoru](#4-fizik-motoru)
5. [Sinyalizasyon ve Blok](#5-sinyalizasyon-ve-blok)
6. [Kapasite ve Blocking-Time](#6-kapasite-ve-blocking-time)
7. [Ring Modeli ve Loop](#7-ring-modeli-ve-loop)
8. [Enerji Analizi](#8-enerji-analizi)
9. [Tek Hat İşletmesi](#9-tek-hat-i̇şletmesi)
10. [Parametreler (SimConfig)](#10-parametreler-simconfig)
11. [UI Modülleri](#11-ui-modülleri)
12. [Kalıcılık, Auth ve Güvenlik](#12-kalıcılık-auth-ve-güvenlik)
13. [Belge Üretimi](#13-belge-üretimi)
14. [Dağıtım ve Altyapı](#14-dağıtım-ve-altyapı)
15. [Doğrulama](#15-doğrulama)
16. [Referanslar ve Sözlük](#16-referanslar-ve-sözlük)

---

## 1. Genel Bakış

**RaySim**, tramvay/metro gibi kentsel raylı sistemler için mikroskobik (saniye-adımlı)
demiryolu simülasyonu yapan bir web uygulamasıdır. Amaç: hat planlama (kapasite/tarife),
sinyalizasyon tasarımının doğrulanması ve teknik dokümantasyon üretimi.

**Yığın:** Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · Firebase
(Firestore + Auth). Tüm hesaplama **istemci tarafında** (tarayıcıda) koşar; sunucu yalnız
statik sayfa ve senaryo depolaması sağlar.

**Birimler:** Tüm çekirdek SI'dir — mesafe **m**, hız **m/s**, süre **s**, kütle **kg**,
kuvvet **N**, ivme **m/s²**. Gösterimde km/km·h⁻¹/dakikaya çevrilir (`src/lib/anaray/format.ts`).

**Kaynak kod haritası** (`src/lib/anaray/`):

| Dosya | Sorumluluk |
|-------|-----------|
| `types.ts` | Çekirdek veri modeli (Line, RollingStock, RailNetwork, Route) |
| `sim.ts` | Tek tren mikroskobik fizik motoru |
| `signalling.ts` | Çok-tren sabit blok + Monte-Carlo + filo |
| `hatsim.ts` | Ring zinciri → birleşik hat + makas bölgeleri (kapasite kaynağı) |
| `blockingtime.ts` | Blocking-time (Sperrzeitentreppe) + UIC 406 kapasite |
| `ring.ts` | Durak-arası ring hücreleri + loop + örnek seed |
| `energy.ts` | Enerji dengesi + rejeneratif geri kazanım |
| `singletrack.ts` | Tek hat kruvasman (meet/pass) + deadlock önleme |
| `network.ts` | Graf → düz koridor (flattenRoute) |
| `config.ts` | Paylaşılan parametreler (SimConfig) + proje künyesi |
| `vehicles.ts` | Hazır araç tipleri |
| `dokuman.ts` | Word/Excel teknik belge üretici |

---

## 2. Mimari

### Tek kaynak (single source of truth)

`SimConfigProvider` (React Context, `src/components/SimConfigProvider.tsx`) tüm modüller için
paylaşılan durumu tutar:

- **`cfg` (SimConfig)** — sayısal simülasyon parametreleri
- **`rings` (DurakArasiRing[])** — proje hattı (ring zinciri)
- **`meta` (ProjeMeta)** — proje künyesi (kapak/belge için)

Bir modülde parametre değişince (ör. Sistem Merkezi'nde headway) **tüm modüller** anında
yeniden hesaplar. Durum `localStorage`'a yazılır (anahtarlar `raysim_*`), oturumlar arası
kalıcıdır.

### Veri akışı

```
Ring (DurakArasiRing[])  ──ringToLine──►  Line  ──simulate──►  Trajectory
       │                                    │
       └──loopToHat──► HatModel ──blockingTimeRing──► makas bölgeleri + kapasite
                          │
RailNetwork+Route ──flattenRoute──► Line   (graf alternatifi)
```

**Kaynak doğruluğu:** Kullanıcı **grafı/ringi** düzenler; fizik motorunun tükettiği düz `Line`
her zaman bundan **türetilir** (elle tutulmaz). Böylece tek gerçek vardır.

### Modül boru hattı

`AppShell` (`src/components/AppShell.tsx`) ortak kabuğu (Masthead + navigasyon + footer)
sağlar. 4 modül soldan sağa mantıksal iş akışıdır: Ringler → Sefer → Sistem → Belgeler.

---

## 3. Veri Modeli

### Altyapı (`types.ts`)

```ts
Station      { id, name, position(m), dwell(s) }
TrackSegment { start(m), end(m), vmax(m/s), gradient(‰, +yokuş yukarı) }
Line         { id, name, length(m), stations[], segments[] }
```

### Çeken araç (RollingStock)

```ts
RollingStock {
  mass(kg), rotatingMassFactor(ρ),   // etkin kütle = mass·(1+ρ)
  length(m), maxSpeed(m/s),
  startingTractiveEffort(N),          // düşük hızda azami çekiş
  power(W),                           // yüksek hızda F = P/v ile sınırlı
  maxBraking(m/s²),                   // servis freni
  davisA, davisB, davisC              // R(v) = A + B·v + C·v²
}
```

### Şebeke grafı

```ts
RailNode { id, name, type: istasyon|makas|sinyal|hatbasi, x, y, dwell? }
RailEdge { id, from, to, length(m), segments: EdgeSegment[] }
Route    { id, name, edgeIds[], startNodeId? }
```

`flattenRoute(net, route)` (`network.ts`) bir rotayı düz `Line`'a çevirir. **İncelik:** ters
yönde geçilen kenarda parça offsetleri çevrilir ve **eğim işareti döner**; son düğüm istasyon
olmasa bile tren orada durur (garantili).

---

## 4. Fizik Motoru

`simulate(line, stock, dt=0.5)` — `src/lib/anaray/sim.ts`. Tek treni zaman-adımlı koşturur.

### Hareket denklemi

```
a = (F_çekiş − R − F_eğim) / m_eff
```

| Terim | Formül |
|-------|--------|
| Etkin kütle | `m_eff = mass·(1 + ρ)` |
| Çekiş kuvveti | `F_çekiş = min(startingTractiveEffort, power / max(v, 0.5))` |
| Davis direnci | `R = davisA + davisB·v + davisC·v²` |
| Eğim bileşeni | `F_eğim = mass · g · (gradient/1000)`,  g = 9.81 |

Net kuvvet negatifse (dik yokuş / yetersiz güç) **sahte ivme eklenmez**; tren doğal denge
hızına oturur.

### Önden fren eğrisi (lookahead)

Trenin bir noktadaki izin verilen hızı, ileride durması/yavaşlaması gereken **her** kısıt için
geri hesaplanır:

```
v_izin = √( v_hedef² + 2·b·mesafe )      (b = maxBraking)
```

- Sonraki durakta hız 0 → `v_izin = √(2·b·mesafe)`
- İleride hız limiti düşen segment → `v_izin = √(v_seg² + 2·b·mesafe)`

Konum, yamuk (trapez) entegrasyonla ilerler: `s += (v + v_yeni)/2 · dt`.

### Rejimler

`hizlanma · seyir · yavaslama · durak` — her yörünge noktası (`TrajectoryPoint`) rejimini taşır;
grafiklerde renklendirilir. `sampleAt(points, t)` animasyon için doğrusal ara-değer verir.

---

## 5. Sinyalizasyon ve Blok

`src/lib/anaray/signalling.ts` — mikroskobik **çok-tren sabit blok** simülasyonu.

### Bloklar

`makeBlocks(line, maxBlockLen)` blok sınırlarını üretir: istasyonlar + her kesim
`maxBlockLen`'i aşmayacak şekilde bölünür.

### Blok işgali — tren boyu

Tren bir **nokta değil**, boyu kadar yer kaplar. `occupiedBlocks(bounds, sBaş, length)` trenin
işgal ettiği `[kuyruk, baş]` aralığını döndürür (`kuyruk = sBaş − length`). Bu, kapasitenin
blocking-time teorisiyle (`t_clearing`) **tutarlı** çıkmasını sağlar — noktasal model kapasiteyi
olduğundan yüksek gösterirdi.

### Hareket yetkisi (MA)

Bir tren, önündeki ilk **başka trenle dolu** bloğa giremez → o bloğun giriş sınırında (kırmızı
sinyal, 1 m geride) durur. `allowedSpeed(line, stock, s, stopTarget, b)` fren eğrisiyle
`min(MA, sonraki durak)`'a göre hızı sınırlar.

### Robustluk — Monte-Carlo

`monteCarlo(...)` her denemede rastgele **giriş gecikmesi** + **durak süresi sapması** (üstel
dağılım) enjekte eder, çok-tren simülasyonunu N kez koşturur; birincil gecikmelerin sonraki
trenlere yayılımını ölçer: dakiklik %, ortalama/P90/max gecikme, tren-sırasına göre gecikme.

### Filo

`fleetSize(gidiş, dönüş, turnaround, headway)` → `araç = ⌈tur_süresi / headway⌉`.
`reverseRoute(route)` dönüş yönünü verir (edgeIds ters, eğim döner).

---

## 6. Kapasite ve Blocking-Time

`src/lib/anaray/blockingtime.ts` — klasik demiryolu kapasite teorisi (Pachl; UIC 406).

### Sperrzeit — 6 bileşen

Her sinyal bloğunun bir tren için rezerve süresi:

```
blocking_time = t_setup + t_sighting + t_approach + t_running + t_clearing + t_release
```

| Bileşen | Kaynak |
|---------|--------|
| t_setup | rota kurma (makas bölgesinde tanzim; düz blokta 0) |
| t_sighting | sürücü görme/reaksiyon (görerek sürüş kabulü: 4 s) |
| t_approach | fren mesafesi kadar önden yaklaşma süresi |
| t_running | bloğun kendi içinde seyir süresi |
| t_clearing | `tren_boyu / çıkış_hızı` |
| t_release | rota serbest bırakma (makas bölgesinde 5/8 s) |

**Kritik blok** = en yüksek blocking-time'lı blok → **min headway**'i belirler.
`teorik_kapasite = 3600 / min_headway` (tren/saat).
**UIC 406 doluluk** = `min_headway / hedef_headway`.

**Sperrzeitentreppe** (`BlockingStairChart.tsx`): yatay = zaman, dikey = mesafe. Her blok bir
dikdörtgen; ardışık bloklar merdiven oluşturur. İki ardışık tren (2. = 1. + min headway)
**kritik blokta tam değer** → min headway gözle görülür.

### Kapasite mutabakatı (`HatSim`)

Üç bağımsız ölçüm karşılaştırılır. **Doğru tutarlılık ölçütü EŞİTLİK DEĞİL, SIRALAMADIR:**

```
analitik (blocking-time)  ≥  sim · sabit blok  ≥  sim · hareketli blok (CBTC)
```

- **Analitik** ihtiyatlıdır (blok, yaklaşma+sighting boyunca da rezerve — seri rezervasyon).
- **Simülasyon** setup'ı yaklaşmayla örtüştürür (boru hatlı) → daha iyimser.
- **Hareketli blok** granülü kaldırır → en sık.

Simülasyon teorik ihtiyatlı sınırı **aşmadığı** sürece sistemler mutabıktır (sim > analitik
olursa gerçek tutarsızlık). Örnek (jenerik seed): **116 s ≥ 63 s ≥ 41 s** — sıralama tutar.

### Hareketli blok (CBTC) — `hatsim.ts`

Sabit blok yerine MA sürekli hesaplanır:
```
MA = (öndeki_trenin_kuyruğu) − emniyet_payı(20 m)
```
Tren, öndekinin fiziksel kuyruğuna kadar sürekli yaklaşır; `simuleHat` her iki modun doygunluk
headway'ini (`kapasiteFixed`, `kapasiteMoving`) döndürür.

---

## 7. Ring Modeli ve Loop

`src/lib/anaray/ring.ts` — iki durak arasındaki her kesim bağımsız bir **ring hücresi**dir.

```ts
DurakArasiRing {
  fromAd, toAd, uzunluk(m),
  worstUzunluk, bestUzunluk,        // worst/best köşeler
  vmax, egim, dwell,
  makaslar: MakasBolgesi[],          // konum, tip, 15 km/h geçiş, tanzim, release
  hemzeminler: Hemzemin[],           // yaya/karayolu geçidi (25 km/h)
  tehlikeNoktalari: TehlikeNoktasi[] // acil frenleme noktaları
}
```

- `ringToLine(ring, mode)` → hücreyi worst/best/nominal moda göre düz Line'a çevirir; makas/geçit
  kısıtları hız bölgesi olarak segmentlere dökülür.
- `loopDenge(rings)` → durak-çiftleri arası **eşit şart** dengesini ölçer (headway kararlılığı).
- `olceklenme(rings)` → tren sayısı arttıkça **darboğaz** ringi bulur.
- `ornekSeed()` → jenerik başlangıç loop'u (5 hücre: Merkez·İstasyon A–D·Terminal). **Bu yalnız
  örnek/test verisidir**; gerçek proje Ringler editöründen girilir.

`loopToHat(rings)` (`hatsim.ts`) ring zincirini tek birleşik `Line` + **makas bölgeleri**ne
(`MakasZon`) çevirir; tam hat çok-tren simülasyonu bunu tüketir.

---

## 8. Enerji Analizi

> **Kapsam notu:** Enerji, arayüzde ayrı bir modül/panel **değildir**. Yalnızca
> üretilen teknik raporda bir *enerji–mesafe figürü* olarak yer alır; ürünün
> odağı hat kurma + canlı sefer simülasyonu + kapasite teşhisi + belge üretimidir.

`src/lib/anaray/energy.ts` — adım adım enerji dengesi:

```
ΔKE + W_direnç + W_eğim = W_çekiş (>0 ise)  |  W_fren (<0 ise)
```

| Sabit | Değer |
|-------|-------|
| Çekiş zinciri verimi | 0.85 |
| Rejeneratif geri kazanım | 0.30 |
| Yardımcı (hotel) yük | 15 kW |

Çıktı: çekiş kWh, rejen kWh, yardımcı kWh, net kWh ve **özgül kWh/km**. Tramvay için tipik
sonuç ~2 kWh/km mertebesindedir.

---

## 9. Tek Hat İşletmesi

`src/lib/anaray/singletrack.ts` — tek ray iki yönde paylaşılır. Kruvasman (geçiş) istasyonları
arası **kesim** bir karşılıklı-dışlama kaynağıdır (aynı anda tek tren, herhangi yön).

**Deadlock önleme:** Tren geçiş istasyonuna varınca mevcut kesimini **BIRAKIR**, sonra sonrakini
**TALEP** eder. "Tut-ve-bekle" hiç oluşmaz → matematiksel olarak deadlock imkânsız. Karşı yönler
yalnız geçiş istasyonlarında karşılaşır.

---

## 10. Parametreler (SimConfig)

`src/lib/anaray/config.ts` — tek kaynak. Sistem Merkezi'nden düzenlenir, her yere yansır.

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| vAnahat | 70 km/h | ana hat azami |
| vSahasal | 40 km/h | sahasal işletme |
| vMakas | 15 km/h | makas bölgesi geçiş |
| vHemzemin | 25 km/h | hemzemin/yaya |
| vAcil | 10 km/h | acil frenleme worst-case |
| ivme / yavaslama | 1.0 / 1.0 m/s² | dinamik |
| headway | 240 s | hedef sefer aralığı |
| ortalamaDurakArasi | 800 m | yeni ring nominal |
| enUzunHeadwayMesafesi | 1500 m | worst-case referans |
| routeReleaseAnahat / Depo | 5 / 8 s | rota serbest bırakma |
| makasAdimMax | 6 s | her makas hareketi |
| acilRotaKilidi | 120 s | acil rota iptali kilidi |
| kisitGenisligi | 40 m | makas/geçit hız-kısıt bölge |
| blokMaxUzunluk | 500 m | sinyal bloğu azami |

Değerler km/h gösteriminden SI'ye `paramSI`/`paramGoster` ile çevrilir.

---

## 11. UI Modülleri

Ana deneyim tek sayfadır (`/` → `TekSayfa`): tüm modüller boru hattı sırasıyla dikey akar.
Eski derin rotalar uyumluluk için durur.

| # | Rota | Modül | İşlev |
|---|------|-------|-------|
| 1 | `/ringler` | Durak Arası Ringler | Ring hücreleri, makas/hemzemin/tehlike kısıtları, worst/best, loop dengesi |
| 2 | `/` | Sefer Simülasyonu | Graf editörü + fizik + headway + kapasite + canlı animasyon |
| 3 | `/sistem` | Sistem Merkezi | Parametreler, canlı durum, Sperrzeitentreppe, challenge |
| 4 | `/belgeler` | Teknik Belgeler | PDF + Word + Excel tasarım el kitabı üretimi |

Canlı animasyon (`LiveNetwork.tsx`) tüm trenleri + işgal bloklarını + makas aspektlerini eş
zamanlı gösterir (requestAnimationFrame). SSR hidrasyon tuzağı `mounted` guard ile çözülür.

---

## 12. Kalıcılık, Auth ve Güvenlik (çok-kiracılı)

### Veri modeli — proje başına belge

Her hat, sahibinin hesabına bağlı **tek bir Firestore belgesidir**
(`src/lib/projeler.ts`). Belge alanları: `uid` (sahip), `ad` (proje/hat adı),
`veri` (tüm simülasyonu tanımlayan JSON — `ProjeVerisi { rings, cfg, meta, arac,
isletme }`), `paylasim` (salt-okunur link açık mı), zaman damgaları. Düzenlerken
`SimConfigProvider` debounce'lu **otomatik kayıt** yapar; ayrı localStorage veya
"vitrin/senaryo" katmanı yoktur.

### Auth — self-servis, anonim çok-kiracılı

`AuthProvider` (Firebase Auth, e-posta/şifre). Fabrika/varsayılan şifre yok; her
ziyaretçi kendi hesabını açar ve **birden çok proje** oluşturur. `yazilabilir`
guard'ı düzenleme iznini belirler: sahip kendi projesinde tam yetkili;
salt-okunur paylaşım görünümünde (`paylasimGorunumu`) `SaltOkunurKalkan` tüm
girdileri `fieldset[disabled]` ile kilitler.

### Firestore güvenlik kuralları — tek koruma katmanı

Firebase web config'i `NEXT_PUBLIC_*` ile tarayıcıya gider (normal); veritabanını
koruyan tek katman `firestore.rules`'tur. Özet mantık:

```
projeler/{id}:
  read   → kaynak.uid == request.auth.uid  VEYA  kaynak.paylasim == true
  write  → kaynak.uid == request.auth.uid            (sahip)
  create → yeni.uid  == request.auth.uid
```

`protectedProcedure` benzeri sunucu rol kontrolü YOKTUR; satır güvenliğini yalnız
bu kurallar sağlar — yeni hassas alan eklerken kural şart.

### Krediler & ödeme — sunucu-otoriteli

Ücretli eylemler (rapor, yeni hat) krediden düşer. **Fiyat ve düşüm sunucuda**
(`src/lib/cuzdanServer.ts` + `/api/kredi/dus`, `/api/rapor`, `/api/proje/*`)
enforce edilir; istemci fiyat/kredi yollayamaz (yalnız paket id seçer). Ödeme
iyzico Checkout Form ile (`/api/odeme/baslat` → gömülü modal → `/api/odeme/callback`).
Sunucu Firebase erişimi lazy Admin SDK'dır (`src/lib/firebaseAdmin.ts`); kimlik
`Authorization: Bearer <idToken>` jose ile doğrulanır. `FIREBASE_SERVICE_ACCOUNT`
tanımsızsa bu uçlar 503 döner.

---

## 13. Belge Üretimi

`src/lib/anaray/rapor.ts` (baskıya hazır PDF/HTML) + `src/lib/anaray/dokuman.ts` (`docx` + `exceljs`):
- `raporHTML()` → amblemli kapak + KPI kartları + hat şeması + blocking-time grafikleri (yazdır → PDF).
- `wordUret()` → profesyonel **.docx** Tasarım El Kitabı (kapak/künye, kriterler, ring şartları,
  kapasite/blocking-time, imza).
- `excelUret()` → çok sayfalı **.xlsx** (künye, kriterler, ringler, kapasite, blocking-time,
  challenge-risk).

İçerik tamamen girilen projeden (`meta` + `rings` + `cfg`) türer — belirli bir hatta bağlı değildir.

---

## 14. Dağıtım ve Altyapı

- **Platform:** Vercel (proje `raysim`, kapsam `ulasiraks-projects`).
- **Otomatik deploy:** GitHub `master`'a her push → Vercel otomatik prod deploy
  (repo: `github.com/ulasirak/turkray`). Elle: `vercel deploy --prod`.
- **Env değişkenleri (Production):** 7× `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_VITRIN`,
  `NEXT_PUBLIC_SITE_URL`. `.env.example` şablondur; `.env.local` git'e girmez.
- **next.config:** `turbopack.root = import.meta.dirname` (kök dizin sabitleme).
- **Firebase kuralları:** `firebase deploy --only firestore:rules`.

### Yerel geliştirme

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (tsc dahil)
npm run lint
```

---

## 15. Doğrulama

- **Uyumluluk taraması:** 6 config × 4 araç tipi × 2 blok modu + diğer motorlar = **74/74**
  geçti (çökme/NaN yok, sıralama invaryantı her yerde korunur).
- **Kapasite mutabakatı (jenerik seed):** analitik 116 s ≥ sim-sabit 63 s ≥ sim-hareketli 41 s.
- **Tek hat invaryantı:** karşılıklı-dışlama ihlali 0, deadlock 0 (4 farklı kruvasman düzeni).
- **Makas fiziği:** ring kısıtları → hız düşümü + worst-case ek süre + blocking-time makas bloğu
  tespiti uçtan uca doğrulandı.
- Her sürüm `tsc --noEmit` + `eslint` + `next build` temiz.

---

## 16. Referanslar ve Sözlük

- **Pachl, J.** — *Railway Operation and Control* (blocking-time teorisi, interlocking).
- **Hansen & Pachl** — *Railway Timetabling & Operations*.
- **UIC 406** — kapasite (sıkıştırılmış işgal / doluluk) metodolojisi.
- **OpenTrack** — referans mikroskobik demiryolu simülasyonu (ETH Zürih); RaySim aynı akademik
  metodolojiyle geliştirilmiş **bağımsız** çekirdektir.

| Terim | Anlam |
|-------|-------|
| Headway | ardışık iki tren arası zaman aralığı (s) |
| Blocking-time | bir bloğun bir tren için rezerve süresi |
| Sperrzeitentreppe | blocking-time merdiveni (zaman-mesafe diyagramı) |
| MA | Movement Authority — hareket yetkisi sınırı |
| Kruvasman | tek hatta karşı yönlerin geçiş/karşılaşma noktası |
| Tanzim | makasların rota için hareket ettirilip kilitlenmesi |
| Fail-safe | arızada en güvenli (dur) duruma geçiş |

---

*RaySim · Demiryolu Ağı Simülasyon Sistemi — teknik dokümantasyon.*
