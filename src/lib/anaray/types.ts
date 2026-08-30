// anaray — demiryolu simülasyonu, çekirdek veri modeli
// Tüm birimler SI: mesafe = metre, hız = m/s, süre = saniye, kuvvet = Newton, kütle = kg.
// Gösterimde km / km/h / dakikaya çevrilir (bkz. format.ts).

// ————————————————————————————————————————————————
// Altyapı (infrastructure)
// ————————————————————————————————————————————————

/** Hat üzerinde trenin durduğu istasyon. */
export interface Station {
  id: string;
  name: string;
  /** Hat başından mesafe (m). */
  position: number;
  /** Durakta bekleme süresi (s). */
  dwell: number;
  /** Parklanma (depo/stabling) alanı mı? Trenler burada servise çıkmaya hazır bekler. */
  depot?: boolean;
  /** Depoysa: çıkışa hazır bekleyen tren sayısı (sırayla headway aralığıyla çıkar). */
  queued?: number;
  /** Duruş noktası türü: yolcu istasyonu (varsayılan) / hemzemin geçit koruma duruşu / kavşak.
   *  'gecit'/'kavsak' fiziksel duruştur ama YOLCU istasyonu değildir (etiket/sayım ayrı). */
  tip?: "istasyon" | "gecit" | "kavsak";
}

/** Hattın bir parçası: sabit hız limiti ve eğim taşır. */
export interface TrackSegment {
  /** Başlangıç konumu (m). */
  start: number;
  /** Bitiş konumu (m). */
  end: number;
  /** Hız limiti (m/s). */
  vmax: number;
  /** Eğim (‰, binde). Pozitif = yokuş yukarı. */
  gradient: number;
}

/** Tek yönlü bir hat (Faz 0). */
export interface Line {
  id: string;
  name: string;
  /** Toplam uzunluk (m). */
  length: number;
  stations: Station[];
  segments: TrackSegment[];
}

// ————————————————————————————————————————————————
// Çeken araç (rolling stock)
// ————————————————————————————————————————————————

export interface RollingStock {
  id: string;
  name: string;
  /** Toplam kütle, boş + yük (kg). */
  mass: number;
  /** Dönen kütle katsayısı ρ (~0.06–0.10); etkin kütle = mass·(1+ρ). */
  rotatingMassFactor: number;
  /** Araç uzunluğu (m). */
  length: number;
  /** Azami hız (m/s). */
  maxSpeed: number;
  /** Düşük hızda azami çekiş kuvveti (N). */
  startingTractiveEffort: number;
  /** Sürekli güç (W); yüksek hızda F = P/v ile sınırlanır. */
  power: number;
  /** Servis freni azami yavaşlaması (m/s²). */
  maxBraking: number;
  /** Davis direnç katsayıları: R(v) = A + B·v + C·v²  (N). */
  davisA: number;
  davisB: number;
  davisC: number;
  // — Yolcu iniş-biniş dinamiği (dwell hesabı için; verilmezse varsayılan kullanılır) —
  /** Araç başına kapı adedi (iniş-biniş kapasitesi). */
  kapiSayisi?: number;
  /** Kapı açıklık genişliği (m). */
  kapiGenisligi?: number;
  /** Araç gövde genişliği (m) — net taban alanı için. */
  aracGenisligi?: number;
  /** Kullanılabilir taban alanı oranı (0..1; koltuk/ekipman düşülmüş). */
  kullanilabilirAlanOrani?: number;
}

// ————————————————————————————————————————————————
// Simülasyon çıktısı
// ————————————————————————————————————————————————

/** Trenin o an içinde bulunduğu hareket rejimi. */
export type Regime = "hizlanma" | "seyir" | "yavaslama" | "durak";

/** Yörüngedeki tek bir zaman noktası. */
export interface TrajectoryPoint {
  t: number; // s
  s: number; // m
  v: number; // m/s
  a: number; // m/s²
  regime: Regime;
}

export interface StationEvent {
  stationId: string;
  arrival: number;   // s
  departure: number; // s
}

export interface SimResult {
  points: TrajectoryPoint[];
  /** Toplam sefer süresi, beklemeler dahil (s). */
  totalTime: number;
  stationEvents: StationEvent[];
}

// ————————————————————————————————————————————————
// Şebeke (graf) modeli
// ————————————————————————————————————————————————
// Ağ, düğüm (RailNode) + kenar (RailEdge) grafıdır. Trenler graf üzerinde
// bir "rota" (sıralı kenarlar) izler. Simülasyon için rota düz bir Line'a
// düzleştirilir (bkz. network.ts → flattenRoute). Line, bir rotanın koridor
// karşılığıdır; fizik motoru daima Line üzerinde çalışır.

export type NodeType = "istasyon" | "makas" | "sinyal" | "hatbasi";

export interface RailNode {
  id: string;
  name: string;
  type: NodeType;
  /** Şematik çizim koordinatları (fizikle ilgisiz, sadece görünüm). */
  x: number;
  y: number;
  /** İstasyon düğümü için durak bekleme süresi (s). */
  dwell?: number;
  /** İstasyon düğümü parklanma (depo) alanı mı? */
  depot?: boolean;
  /** Depoysa: çıkışa hazır bekleyen tren sayısı. */
  queued?: number;
}

/** Bir kenar üzerindeki yerel parça: sabit hız limiti + eğim. */
export interface EdgeSegment {
  /** Kenar-yerel başlangıç offseti (m), 0..length. */
  start: number;
  end: number;
  vmax: number;     // m/s
  gradient: number; // ‰, kenarın from→to yönünde
}

/** İki düğümü bağlayan hat kenarı. segments tüm [0,length]'i kaplamalı. */
export interface RailEdge {
  id: string;
  from: string; // RailNode id
  to: string;   // RailNode id
  length: number; // m
  segments: EdgeSegment[];
}

export interface RailNetwork {
  id: string;
  name: string;
  nodes: RailNode[];
  edges: RailEdge[];
}

/** Bir trenin izleyeceği sıralı kenar dizisi. */
export interface Route {
  id: string;
  name: string;
  edgeIds: string[];
  /** Opsiyonel başlangıç düğümü; verilmezse ilk iki kenardan çıkarılır. */
  startNodeId?: string;
}
