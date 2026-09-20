// raysim — KONYA ETAP İSTASYONLARI: DEMOYA ÖZEL YAKLAŞIK KOORDİNATLAR (±~150m).
//
// ⚠️ Bu dosya, sürdürülebilir "gömülü yok" ilkesine tek İSTİSNADIR ve yalnızca DEMO
//    amaçlıdır. Konya 1./2. Etap istasyonları OpenStreetMap'te henüz adlı node olarak
//    YOK (yalnızca inşaat hatları çizili). Bu yüzden mevcut hat gibi OSM'den canlı
//    çekilemiyorlar. Müşteri demosunda etapların da haritada görünmesi için:
//
//    ÜRETİM YÖNTEMİ (uydurma DEĞİL — gerçek CAD + gerçek OSM):
//      1. Karşı tarafın AutoCAD güzergâh projesi (Alaaddin-Etap1-2-depo_v11) →
//         accoreconsole DXF → Civil3D "HAT1" alignment tik-hattı = GERÇEK merkez hattı (UTM).
//      2. HAT1 şekli, OSM inşaat hattına ICP ile hizalandı (transform OSM'den türetildi).
//      3. İstasyonlar GERÇEK CAD kilometrajıyla (durak-arası mesafeler) merkez hatta oturtuldu.
//      4. OSM inşaat koridoruna snap + Şehir Hastanesi/Adliye OSM çapalarıyla doğrulandı.
//      Üretici: scripts/etap1_projekte.py (yeniden üretilebilir).
//
//    HASSASİYET: ~150m (bazı istasyonlar 200-400m). OSM mevcut hat (~10m) kadar keskin
//    DEĞİL — bu yüzden koordinatYaklasik=true ile işaretlenir ve haritada uyarı gösterilir.
//    OSM'e etap istasyonları eklendiğinde retry'li auto-fetch bunları GERÇEK veriyle
//    üzerine yazar; bu dosya o gün silinebilir.
//
// Kaynak: © OpenStreetMap (ODbL) hizalama + AYGM/yüklenici CAD güzergâh projesi.

export type IstKoord = Record<string, { lat: number; lon: number }>;

/** 1. Etap (Aslım Sanayi → Şehir Hastanesi → Adliye) — CAD HAT1 + kilometraj, OSM-hizalı. */
export const ETAP1_KOORDINAT: IstKoord = {
  "Aslım Sanayi": { lat: 37.93088, lon: 32.56869 },
  "Ravza Camii": { lat: 37.9253, lon: 32.5639 },
  "Gülistan Caddesi": { lat: 37.91669, lon: 32.55661 },
  "Motorlu Taşıtlar Sanayisi": { lat: 37.9108, lon: 32.5547 },
  "Büsan Sanayi": { lat: 37.89969, lon: 32.55221 },
  "Hüdai": { lat: 37.8964, lon: 32.5512 },
  "Sedirler Kavşağı": { lat: 37.8898, lon: 32.5531 },
  "Depo": { lat: 37.8817, lon: 32.55333 },
  "Şehir Parkı": { lat: 37.87367, lon: 32.55365 },
  "Ereğli Kavşağı": { lat: 37.8656, lon: 32.5537 },
  "Rezerv İstasyonu": { lat: 37.86004, lon: 32.55388 },
  "Şehir Hastanesi": { lat: 37.85656, lon: 32.54901 },
  "Adliye (Lise/Okullar)": { lat: 37.8614, lon: 32.543 }, // OSM Adliye (gerçek — mevcut hatla paylaşılan)
};
