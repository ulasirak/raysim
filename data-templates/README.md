# RaySim — 2. Etap Veri Gereksinim Şartnamesi

Bu klasör, simülasyon motorunun (Sefer / Ringler / Tam Hat / Anklaşman / Enerji /
Bildfahrplan / Sperrzeitentreppe / PDF Rapor) çalışması için gereken **tüm veri
tiplerini** ve doldurulacak **şablon dosyaları** içerir. Motor SI birimlerle çalışır
ama şablonlarda **insan-dostu birimler** (km/h, ‰, m, s, ton, kN, kW) istenir;
içe aktarımda otomatik çevrilir.

> Kaynak: kod taraması — `types.ts`, `config.ts`, `ring.ts`, `interlocking.ts`, `vehicles.ts`, `gtfs.ts`.

---

## 0) ÖNCELİK — En az veriyle ne çalışır?

| Aşama | Gereken dosyalar | Çalışan simülasyonlar |
|---|---|---|
| **Minimum (fizik+kapasite)** | GTFS (`stops.txt`+`shapes.txt`+yükseklik) · `2-arac.json` · `3-parametreler.json` | Sefer, Ringler, Tam Hat, hız/eğim profili, enerji, Bildfahrplan, Sperrzeitentreppe, kapasite, PDF rapor |
| **+ Saha kısıtları** | `4-makaslar.csv` · `5-hemzemin.csv` · `6-tehlike.csv` | Yukarıdakiler + gerçek makas/geçit/tehlike (tahmin yerine kesin) |
| **+ Anklaşman (tam)** | `7-anklasman-bolgeler.json` | Makas bölgesi interlocking, çakışma matriksi, sinyal aspektleri, dispatcher |
| **Belge künyesi** | `8-proje-kunye.json` | PDF/Word/Excel kapak + künye |

**Sadece GTFS + 1 araç + parametreler** verirsen sistemin %80'i gerçek veriyle koşar.
Makas/geçit yoksa sistem bunları geometriden **tahmin eder** (Coğrafi modül), ama kesin veri her zaman önceliklidir.

---

## 1) HAT GEOMETRİSİ  → GTFS (tercih) veya `1-hat.csv`

Motorun temeli: sıralı duraklar + her durak-arası mesafe + hız limiti + eğim.

### En kolay yol: GTFS (operatörde varsa)
- **`stops.txt`** — sütunlar: `stop_id, stop_name, stop_lat, stop_lon, stop_elevation`
  - `stop_lat/lon`: WGS84 ondalık derece (ör. 37.87050, 32.49250)
  - `stop_elevation`: metre (deniz seviyesinden) — **eğim bundan hesaplanır**; yoksa hat düz varsayılır
  - Duraklar **hat sırasıyla** olmalı (veya `stop_times.txt`/`trips.txt` ile sıra verilmeli)
- **`shapes.txt`** — sütunlar: `shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence`
  - **Ne kadar sık nokta, o kadar doğru kurp/hız** (ideal ≤ 20 m aralık). Seyrek shape'te tight kurp yakalanamaz.
- İçe aktarım: **Coğrafi Güzergah modülü** → dosyaları yükle → "Bu güzergahtan hat üret".

### GTFS yoksa: `1-hat.csv` (durak listesi)
Her satır bir durak (sırayla). Ardışık iki durak arası bir "hücre" olur.

| sütun | birim | zorunlu | açıklama |
|---|---|---|---|
| `ad` | metin | ✔ | Durak adı |
| `enlem` | derece | ⭘ | WGS84 (harita + kurp/eğim için) |
| `boylam` | derece | ⭘ | WGS84 |
| `yukseklik_m` | m | ⭘ | Eğim hesabı için |
| `mesafe_m` | m | ⭘* | Önceki duraktan mesafe (koordinat yoksa **zorunlu**) |
| `dwell_s` | s | ⭘ | Durakta bekleme (vars. 20 s) |
| `vmax_kmh` | km/h | ⭘ | Bu hücrenin sahasal hız limiti (vars. parametredeki sahasal) |
| `egim_binde` | ‰ | ⭘ | Yükseklik yoksa elle (+ yokuş yukarı) |

> **En değerli belge:** güzergah **plan-profil çizimi** (kurp yarıçapı cetveli + eğim/kot cetveli + kilometraj). Kurp yarıçapları ve eğimler oradan birebir alınır.

---

## 2) ÇEKEN ARAÇ  → `2-arac.json` (kullanılan her araç tipi için bir kayıt)

Trenin fiziği (kalkış, seyir, fren, enerji) tümüyle buna bağlı. **Araç teknik
şartnamesi / traction datasheet**'ten alınır.

| alan | birim | zorunlu | açıklama |
|---|---|---|---|
| `ad` | metin | ✔ | Araç tipi adı |
| `kutle_ton` | ton | ✔ | Tare + yolcu yükü (AW2/AW3 — hangisini kullandığını belirt) |
| `donen_kutle_katsayisi` | – | ⭘ | ρ ≈ 0.06–0.10 (dönen kütle etkisi; vars. 0.08) |
| `uzunluk_m` | m | ✔ | Tren boyu (blok işgali + temizleme süresi için) |
| `azami_hiz_kmh` | km/h | ✔ | Aracın tasarım azami hızı |
| `kalkis_cekis_kuvveti_kN` | kN | ✔ | Düşük hızda azami çekiş kuvveti (starting tractive effort) |
| `surekli_guc_kW` | kW | ✔ | Sürekli güç (yüksek hızda F=P/v sınırı) |
| `servis_freni_ms2` | m/s² | ✔ | Servis freni azami yavaşlama (~1.0–1.3) |
| `davis_A_N` | N | ⭘ | Davis direnç: R(v)=A+B·v+C·v² |
| `davis_B_Ns_m` | N·s/m | ⭘ | — |
| `davis_C_Ns2_m2` | N·s²/m² | ⭘ | — |

> Davis katsayıları elinde yoksa: aracın **direnç eğrisi** (N vs km/h tablosu) ya da
> tipini söyle (tramvay/LRV/hafif metro) — makul katsayı ile başlarız, sen sonra düzeltirsin.

---

## 3) İŞLETME PARAMETRELERİ  → `3-parametreler.json` (15 parametre)

Sinyalizasyon **tasarım el kitabı / şartname** (RaySim'de örnek: MAZ-VA-AKS-001)
kabullerinden gelir. Parantezdeki madde numaraları o belgedeki tipik yeri gösterir.

| alan | birim | tipik | açıklama |
|---|---|---|---|
| `ana_hat_hiz_kmh` | km/h | 70 | Ana hat serbest seyir üst hızı |
| `sahasal_hiz_kmh` | km/h | 40 | Durak-arası ortalama işletme hızı |
| `makas_hiz_kmh` | km/h | 15 | Makas bölgesi geçiş hızı (§3.4.8.2) |
| `hemzemin_hiz_kmh` | km/h | 25 | Yaya/hemzemin geçit yavaşlama hızı |
| `acil_hiz_kmh` | km/h | 10 | Tehlike/acil frenleme noktası worst-case hızı |
| `ivme_ms2` | m/s² | 1.0 | Kalkış/hızlanma ivmesi (a) |
| `yavaslama_ms2` | m/s² | 1.0 | Servis fren yavaşlaması (b) |
| `headway_s` | s | 240 | Sözleşme hedef sefer aralığı |
| `ortalama_durak_arasi_m` | m | 800 | Yeni hücre nominal mesafesi |
| `worst_case_mesafe_m` | m | 1500 | En uzun durak-arası referans |
| `route_release_anahat_s` | s | 5 | Ana hat makas rota serbest bırakma |
| `route_release_depo_s` | s | 8 | Depo manevra rota serbest bırakma |
| `makas_adim_s` | s | 6 | Her makas hareketi (tanzim) süresi |
| `acil_rota_kilidi_s` | s | 120 | Acil rota iptali emniyet kilidi |
| `kisit_bolge_genisligi_m` | m | 40 | Makas/geçit hız-kısıt bölge uzunluğu |
| `blok_azami_uzunluk_m` | m | 500 | Sinyal bloğu azami uzunluğu |

---

## 4) MAKASLAR  → `4-makaslar.csv` (her makas bölgesi bir satır)

Sinyalizasyon **yerleşim planı / şema planı**'ndan. Konum = ait olduğu durak-arası
hücrenin başından mesafe.

| sütun | birim | açıklama |
|---|---|---|
| `hucre` | metin | Ait olduğu durak-arası (ör. "İstasyon A → İstasyon B") |
| `ad` | metin | Makas/bölge adı (ör. "1. Makas Bölgesi") |
| `tip` | liste | `karsilasmali` / `headway` / `barinma` / `depo` / `udonus` |
| `konum_m` | m | Hücre başından mesafe |
| `gecis_hiz_kmh` | km/h | Makas geçiş hızı (vars. 15) |
| `tcc_zorunlu` | E/H | Her geçişte TCC onayı gerekir mi? |
| `makas_adim_s` | s | Bir makas hareketi süresi (≤6) |
| `makas_sayisi` | adet | Ardışık makas adedi (çoklu tanzim) |
| `route_release_s` | s | Rota serbest bırakma (5 ana hat / 8 depo) |

**tip anlamları:** karsilasmali = yüz-yüze (her geçiş TCC) · headway = blok makası ·
barinma = hattı kesen 3. yön · depo = depo giriş/çıkış · udonus = izole S-makas U-dönüş.

---

## 5) HEMZEMİN GEÇİTLER  → `5-hemzemin.csv`

| sütun | birim | açıklama |
|---|---|---|
| `hucre` | metin | Ait olduğu durak-arası |
| `ad` | metin | Geçit adı |
| `tip` | liste | `yaya` / `karayolu` |
| `konum_m` | m | Hücre başından mesafe |
| `hiz_kmh` | km/h | Geçitte düşülen hız (vars. 25) |

## 6) TEHLİKE / ACİL FRENLEME NOKTALARI  → `6-tehlike.csv`

Keskin kurp, görüş kısıtı, kritik nokta vb.

| sütun | birim | açıklama |
|---|---|---|
| `hucre` | metin | Ait olduğu durak-arası |
| `ad` | metin | Nokta adı |
| `konum_m` | m | Hücre başından mesafe |
| `hiz_kmh` | km/h | Bu noktada worst-case'de düşülen hız (acil frenleme) |
| `aciklama` | metin | Neden (ör. "keskin kurp R=90 m") |

---

## 7) ANKLAŞMAN TOPOLOJİSİ  → `7-anklasman-bolgeler.json` (her makas bölgesi)

**İnterlocking tabloları / kontrol tabloları + çakışma matriksi**'nden. Bu, makas
bölgesi anklaşman motorunu (route-setting, aspekt, çakışma) besler.

Her bölge nesnesi:
```jsonc
{
  "id": "LOC1",                 // bölge kodu
  "ad": "1. Makas Bölgesi",
  "tip": "karsilasmali",        // karsilasmali|headway|barinma|depo|udonus
  "uzunluk_m": 180,             // bölge fiziksel uzunluğu (geçiş süresi için)
  "bloklar": ["BS_1","BS_2"],   // bölgedeki sinyal blokları
  "makaslar": ["PM_1","PM_2"],  // makas kimlikleri
  "sinyaller": ["SG_1","SG_2"], // sinyal kimlikleri
  "rotalar": [
    {
      "id": "LOC1_AD",
      "nereden": "A", "nereye": "D",
      "bloklar": ["BS_1","BS_2"],           // serbest olması gereken bloklar
      "makaslar": [{"id":"PM_1","konum":"AD"}], // gereken makas doğrultuları
      "sinyal": "SG_1",                      // giriş sinyali
      "headway_gerekli": false,
      "tcc_gerekli": true
    }
  ],
  "es_zamanli": [["LOC1_AD","LOC1_CB"]]      // aynı anda kurulabilen rota çiftleri
                                             // (çakışma matriksinde X). Verilmezse
                                             // blok/makas paylaşımından türetilir.
}
```

> `es_zamanli` = **çakışma matriksinin X'leri**. Elinde matriks varsa doğrudan onu
> ver; yoksa boş bırak, motor kaynak paylaşımından türetir (ihtiyatlı).

---

## 8) PROJE KÜNYESİ  → `8-proje-kunye.json`

PDF/Word/Excel raporların kapağı. Alanlar: `projeAdi, hatAdi, idare, yuklenici,
musavir, sinyalizasyonFirmasi, dokumanNo, revizyon, tarih, hazirlayan, onaylayan`.

---

## Hangi belgeler bu verileri içerir? (kaynak eşlemesi)

| Belge | Beslediği |
|---|---|
| **GTFS feed** (operatör) | Hat geometrisi (§1) |
| **Güzergah plan-profil çizimi** (kurp yarıçapı + eğim/kot cetveli + kilometraj) | Mesafe, kurp→vmax, eğim (§1) — GTFS yoksa **en kritik** |
| **Sinyalizasyon yerleşim/şema planı** (blok/sinyal/makas) | Makas, blok, sinyal (§4, §7) |
| **İnterlocking / kontrol tabloları + çakışma matriksi** | Rotalar + eş-zamanlılık (§7) |
| **Araç teknik şartnamesi / traction datasheet** | Çeken araç (§2) |
| **Tasarım el kitabı / şartname** (headway, hızlar, süreler) | Parametreler (§3) |
| **Sefer planı / işletme programı** (dwell, headway, turnaround) | Dwell, headway (§1, §3) |
| **Hemzemin geçit envanteri** | Geçitler (§5) |

---

## Teslim biçimi

- **İdeal:** GTFS klasörü + bu şablonların doldurulmuş hâli (CSV/JSON).
- **Alternatif:** yukarıdaki ham belgeler (PDF/DWG/Excel) — ben içinden çıkarır,
  şablona işlerim (özellikle plan-profil ve interlocking tabloları).
- **Belirsizlik olursa:** eksik alanları makul kabullerle doldurur, "tahmini"
  işaretlerim; sen sonra düzeltirsin. Hiçbir uydurma değeri gerçekmiş gibi sunmam.
