# RaySim — Doğrulama Dosyası (Validation Dossier)

**Amaç.** RaySim kapasite çekirdeğinin çıktılarının; (a) yöntemsel olarak sağlam,
(b) sürüm boyunca sabit (regresyonsuz), ve (c) tüm ürün yüzeylerinde birebir tutarlı
olduğunu kanıta bağlamak. Rapor kapaklarındaki *"UIC 406 metodolojisine dayanan
bağımsız çekirdek; her değer canlı simülasyonda birebir yeniden üretilebilir"*
beyanının dayanağı bu dosyadır.

## 1. Yöntem

- **Kapasite:** UIC 406 blocking-time (Sperrzeitentreppe / Pachl) esaslı. Minimum
  headway (h_min) = darboğazda bir bloğun rezerve (blocking-time) süresi; kısıtların
  en büyüğü: blok · terminal dönüşü · tek hat · düz kavşak · sinyal aspect çevrimi.
- **Sürdürülebilir:** h_min'e UIC 406 doluluk tavanı (varsayılan %70) uygulanır.
- **Tek çekirdek:** Rapor (`rapor.ts`), Senaryo Karşılaştırma (`karsilastirma.ts`) ve
  Canlı Simülasyon/Sefer (`Studio`, `SistemMerkezi`) **aynı** fonksiyonları çağırır:
  `maksimumTren` · `blockingTimeRing` · `tersIsletmeAnaliz` · `hatOzellikleri`.
  Ayrı hesap YOKTUR → üç yüzeyde de sonuç birebir aynıdır.

## 2. Referans hatlar (gerçek CAD verisi)

Konya Tramvay'ın dört etabı, kullanıcının AutoCAD DWG'lerinden çıkarılan gerçek
kilometraj + resmi istasyon adlarıyla. Aşağıdaki değerler **golden-master** olarak
kilitlenmiştir.

| Hat | nTeorik | Sürdürülebilir | Min headway | Çevrim | İşl. kap. | UIC | Sinyal | Darboğaz |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Mevcut (Alaaddin–Adliye) | 15 | 10 | 135 s | 2080 s | 19 tr/sa | %56 | 23 | Kritik blok — Hükümet |
| 1. Etap (Aslım–Adliye) | 26 | 18 | 139 s | 3703 s | 18 tr/sa | %58 | 30 | Kritik blok — Ravza Camii |
| 2. Etap (Stadyum–Aslım) | 23 | 16 | 125 s | 2885 s | 20 tr/sa | %52 | 25 | Kritik blok — Betoncular |
| Bütünleşik (Alaaddin–Stadyum) | 54 | 37 | 148 s | 7986 s | 17 tr/sa | %62 | 78 | Kritik blok — Adliye |

Talep çekirdeği (rol-dağıtımlı): gereken filo 5 / 9 / 7 / 15; tepe yük 1466 / 1605 /
1405 / 1213 yolcu/saat.

## 3. Değişmezler (invariants)

- **Kapasite ↔ blocking-time tutarlılığı:** `maksimumTren.h_min == blockingTimeRing.minHeadway`
  her hatta. (Rapor & Sistem Merkezi bu ikisini ayrı yüzeyde gösterir; ayrışırsa
  eski 130↔148 blocking-time bug'ı geri gelmiş demektir.)
- **Stok ↔ akış (Little):** aynı-anda-araç (nTeorik) ≈ saatlik-akış (tren/saat) × tur
  süresi. Rapordaki iki ölçü aynı sınırın iki yüzüdür.

## 4. Regresyon kalkanı (golden-master testi)

`src/lib/anaray/__tests__/kapasite.golden.test.ts` — 44 iddia. Motorda yapılan bir
değişiklik yukarıdaki değerlerden herhangi birini oynatırsa test **kırılır**. Böylece
rapor, karşılaştırma ve canlı sim aynı anda korunur.

```
npm test        # vitest run — 44/44 geçmeli
```

Bir değerin **bilinçli** değişmesi gerekiyorsa (motor iyileştirmesi), golden değer
bu dosyayla birlikte güncellenir ve değişimin gerekçesi commit'te belirtilir.

## 5. Yeniden üretilebilirlik

Her rapor/karşılaştırma değeri, kapaktaki QR ile açılan **canlı simülasyonda** birebir
yeniden üretilebilir (aynı çekirdek). Bağımsız doğrulama için referans yöntem:
OpenTrack (UIC 406) ile karşılaştırmalı benchmark — planlı.
