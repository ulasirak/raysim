# RaySim — Sistem Dokümantasyonu

Demiryolu ağı simülasyon, sinyalizasyon/anklaşman ve kapasite analizi platformu.
Blocking-time (Sperrzeitentreppe) ve UIC 406 metodolojisine dayanan bağımsız çekirdek.

> Bu belge sistemin **teknik/geliştirici dokümantasyonudur** — mimari, matematik motoru,
> veri modeli ve dağıtım. Kullanıcıya dönük özet için kök `README.md`'ye bakın.

## İçindekiler

1. [Genel Bakış](#1-genel-bakış)
2. [Mimari](#2-mimari)
3. [Veri Modeli](#3-veri-modeli)
4. [Fizik Motoru](#4-fizik-motoru)
5. [Sinyalizasyon ve Blok](#5-sinyalizasyon-ve-blok)
6. [Anklaşman (Interlocking)](#6-anklaşman-interlocking)
7. [Kapasite ve Blocking-Time](#7-kapasite-ve-blocking-time)
8. [Ring Modeli ve Loop](#8-ring-modeli-ve-loop)
9. [Enerji Analizi](#9-enerji-analizi)
10. [Tek Hat İşletmesi](#10-tek-hat-i̇şletmesi)
11. [Parametreler (SimConfig)](#11-parametreler-simconfig)
12. [UI Modülleri](#12-ui-modülleri)
13. [Kalıcılık, Auth ve Güvenlik](#13-kalıcılık-auth-ve-güvenlik)
14. [Belge Üretimi](#14-belge-üretimi)
15. [Dağıtım ve Altyapı](#15-dağıtım-ve-altyapı)
16. [Doğrulama](#16-doğrulama)
17. [Referanslar ve Sözlük](#17-referanslar-ve-sözlük)

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
| `hatsim.ts` | Tam hat çok-tren + hareketli blok (CBTC) + interlocking birleşimi |
| `interlocking.ts` | Makas bölgesi anklaşman motoru (dağıtık) |
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
       └──loopToHat──► HatModel ──simuleHat──► çok-tren + interlocking + kapasite
                          │
RailNetwork+Route ──flattenRoute──► Line   (graf alternatifi)
```

**Kaynak doğruluğu:** Kullanıcı **grafı/ringi** düzenler; fizik motorunun tükettiği düz `Line`
her zaman bundan **türetilir** (elle tutulmaz). Böylece tek gerçek vardır.

### Modül boru hattı

`AppShell` (`src/components/AppShell.tsx`) ortak kabuğu (Masthead + navigasyon + footer)
sağlar. 6 modül soldan sağa mantıksal iş akışıdır: Sefer → Ringler → Anklaşman → Tam Hat →
Sistem → Belgeler.

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

## 6. Anklaşman (Interlocking)

`src/lib/anaray/interlocking.ts` — **dağıtık** makas bölgesi anklaşmanı (merkezi ana anklaşman
yok; her bölge bağımsız SIL4 birimi, TCC yalnız istek/onay arayüzü).

### Çakışma matriksi

İki rota **çakışır** (aynı anda kurulamaz) eğer:
- ortak bir blok kullanıyorlarsa, **veya**
- ortak bir makası **farklı doğrultuda** istiyorlarsa.

`cakismaMatriksi(topo)` tam matriksi üretir (X = birlikte uygun, 0 = değil). Belge senaryoları
`esZamanli` çiftleriyle de verilebilir.

### Faz makinesi

Her rota süreci: `bos → talep → tanzim → kurulu → isgal → release → bos`

| Faz | Anlam | Süre |
|-----|-------|------|
| tanzim | makaslar sıralı hareket (SARI) | `makas_sayısı × makasAdimMax` (≤6 s/adım) |
| kurulu | tüm zincir kilitli, giriş sinyali YEŞİL | anlık |
| isgal | tren bölgede, arkadaki sinyaller KIRMIZI | geçiş süresi |
| release | rota serbest bırakma kilidi | 5 s ana hat / 8 s depo |

**Emniyet:** çakışan rota talepleri kuyrukta bekler. **Fail-safe:** kritik arıza penceresinde
bölge sinyalleri **SÖNÜK** (blanking).

---

## 7. Kapasite ve Blocking-Time

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

## 8. Ring Modeli ve Loop

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

## 9. Enerji Analizi

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

## 10. Tek Hat İşletmesi

`src/lib/anaray/singletrack.ts` — tek ray iki yönde paylaşılır. Kruvasman (geçiş) istasyonları
arası **kesim** bir karşılıklı-dışlama kaynağıdır (aynı anda tek tren, herhangi yön).

**Deadlock önleme:** Tren geçiş istasyonuna varınca mevcut kesimini **BIRAKIR**, sonra sonrakini
**TALEP** eder. "Tut-ve-bekle" hiç oluşmaz → matematiksel olarak deadlock imkânsız. Karşı yönler
yalnız geçiş istasyonlarında karşılaşır.

---

## 11. Parametreler (SimConfig)

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

## 12. UI Modülleri

| # | Rota | Modül | İşlev |
|---|------|-------|-------|
| 1 | `/` | Sefer Simülasyonu | Graf editörü + fizik + headway + kapasite + canlı animasyon |
| 2 | `/ringler` | Durak Arası Ringler | Ring hücreleri, worst/best, loop dengesi |
| 3 | `/anklasman` | Makas Bölgesi Anklaşman | Interlocking, çakışma matriksi, aspekt oynatma |
| 4 | `/hat` | Tam Hat | Çok tren, sabit/hareketli blok, kapasite mutabakatı, darboğaz |
| 5 | `/sistem` | Sistem Merkezi | Parametreler, canlı durum, Sperrzeitentreppe, challenge |
| 6 | `/belgeler` | Teknik Belgeler | Word + Excel tasarım el kitabı üretimi |

Canlı animasyon (`LiveNetwork.tsx`) tüm trenleri + işgal bloklarını + makas aspektlerini eş
zamanlı gösterir (requestAnimationFrame). SSR hidrasyon tuzağı `mounted` guard ile çözülür.

---

## 13. Kalıcılık, Auth ve Güvenlik

### localStorage

`SimConfigProvider` cfg/rings/meta'yı `raysim_*` anahtarlarıyla saklar. Anahtar öneki
değiştiğinde eski kayıtlar yok sayılır (versiyon/temizlik mekanizması).

### Firebase — Firestore (senaryolar)

`src/lib/scenarios.ts` senaryoları `senaryolar` koleksiyonunda saklar (JSON payload). Firebase
web config'i `NEXT_PUBLIC_*` ile tarayıcıya gider (normal) — **veritabanını koruyan tek katman
Firestore kurallarıdır** (`firestore.rules`):

```
senaryolar: read  → herkes (vitrin)
            write → yalnız request.auth.token.email == <yönetici>
```

### Auth — yönetici girişi

`getAuthInstance()` (Email/Password). Vitrin modunda (`NEXT_PUBLIC_VITRIN=1`) ziyaretçi
salt-okunur; yalnız giriş yapan yönetici Kaydet/Sil görür (`yazabilir = !vitrin || !!user`).

---

## 14. Belge Üretimi

`src/lib/anaray/dokuman.ts` (`docx` + `exceljs`):
- `wordUret()` → profesyonel **.docx** Tasarım El Kitabı (kapak/künye, kriterler, ring şartları,
  makas senaryoları + çakışma matriksleri, kapasite, imza).
- `excelUret()` → 7 sayfalı **.xlsx** (künye, kriterler, ringler, makas rotaları, çakışma
  matriksi, kapasite, challenge-risk).

İçerik tamamen girilen projeden (`meta` + `rings` + `cfg`) türer — belirli bir hatta bağlı değildir.

---

## 15. Dağıtım ve Altyapı

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

## 16. Doğrulama

- **Uyumluluk taraması:** 6 config × 4 araç tipi × 2 blok modu + diğer motorlar = **74/74**
  geçti (çökme/NaN yok, sıralama invaryantı her yerde korunur).
- **Kapasite mutabakatı (jenerik seed):** analitik 116 s ≥ sim-sabit 63 s ≥ sim-hareketli 41 s.
- **Tek hat invaryantı:** karşılıklı-dışlama ihlali 0, deadlock 0 (4 farklı kruvasman düzeni).
- **Anklaşman:** çakışma matriksi belgeyle uyumlu, mutual-exclusion ≤ makas sayısı, fail-safe
  sönük.
- Her sürüm `tsc --noEmit` + `eslint` + `next build` temiz.

---

## 17. Referanslar ve Sözlük

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
