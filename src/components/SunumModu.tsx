"use client";

// raysim — SUNUM / HİKAYE MODU (kapsamlı, çok dilli rehberli pitch).
// Sistemin HER parçasını doğru sırayla + doğru dille anlatır. 3 DİL: Türkçe (varsayılan),
// İngilizce, Almanca — anlatım + kontrol etiketleri canlı değişir. Akış:
//  Kapak → KUR → ANALİZ (Filo·Canlı·Grafik·Risk) → SİSTEM (Kapasite·Terminal·Karar·Doğrulama)
//  → BELGELE → KARŞILAŞTIR → Kapanış kartı.
// Her (kapak-olmayan) adım, o bölmeyi tek bakışta kavratan yapılandırılmış bir REHBER KARTI
// taşır: Amaç · Girdi · Çıktı · bölmedeki paneller/grafikler · tıklanabilir kontroller ·
// bağlantılı bölümler (tıklayınca o adıma atlar). Her adımda: (1) modüle kaydırır,
// (2) gereken SEKMEYİ açar (radio .click()), (3) gereken butonları tıklar (data-sunum),
// (4) paneli altın "spot" halkasıyla vurgular (.sunum-vurgu). ← → gez, Esc çık, ⏵ oto-oynat.

import { useEffect, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import type { BolumSlug } from "@/components/TekSayfa";
import { useDil, type Dil } from "@/components/DilProvider";

// Bir bölmedeki tek bir panel / grafik / kontrol — ad + tek satır açıklama.
type Oge = { ad: string; ne: string };
type Metin = {
  faz: string;
  baslik: string;
  anlatim: string;
  amac?: string;          // ne işe yarar
  girdi?: string;         // neyi okur / nereden beslenir
  cikti?: string;         // neye göre ne üretir
  bolmeler?: Oge[];       // bu sekmedeki paneller & grafikler
  butonlar?: Oge[];       // tıklanabilir kontroller
};
type Adim = {
  no: string;
  anahtar: string;        // kararlı kimlik (bağlantı hedefi)
  slug: BolumSlug;        // kaydırılacak modül bölümü
  sekme?: string;         // açılacak sekme radio id'si (ör. "sm-t3", "sf-t2")
  tikla?: string[];       // ek OTO-tıklanacak butonlar (data-sunum anahtarı)
  hedefId?: string;       // slug yerine özel kaydırma/vurgu hedefi (ör. "canli")
  kapak?: boolean;        // tam ekran kapak kartı (giriş/kapanış)
  baglanti?: string[];    // bağlantılı adımların anahtarları
  metin: Record<Dil, Metin>;
};

const DILLER: Dil[] = ["tr", "en", "de"];

// Kontrol/etiket sözlüğü (dile göre).
const UI: Record<Dil, {
  basla: string; ileri: string; geri: string; bitir: string; bastan: string;
  oynat: string; duraklat: string; cik: string; ac: string; acTitle: string;
  amac: string; girdi: string; cikti: string; bolmeler: string; butonlar: string;
  baglanti: string; ac2: string; kapat2: string;
}> = {
  tr: {
    basla: "Başla", ileri: "İleri", geri: "Geri", bitir: "Bitir", bastan: "Baştan",
    oynat: "Otomatik ilerlet", duraklat: "Duraklat", cik: "Sunumdan çık",
    ac: "Sunum Modu", acTitle: "Her bölmenin amacını, girdisini, çıktısını, grafiklerini ve butonlarını tek tek gezdiren kapsamlı rehberli sunum (TR · EN · DE)",
    amac: "Amaç", girdi: "Girdi", cikti: "Çıktı",
    bolmeler: "Bu bölmedeki paneller & grafikler", butonlar: "Tıklanabilir kontroller",
    baglanti: "Bağlantılı bölümler", ac2: "Rehberi aç", kapat2: "Rehberi küçült",
  },
  en: {
    basla: "Start", ileri: "Next", geri: "Back", bitir: "Finish", bastan: "Restart",
    oynat: "Auto-play", duraklat: "Pause", cik: "Exit",
    ac: "Presentation Mode", acTitle: "A comprehensive guided tour that walks through every section's purpose, input, output, charts and buttons one by one (TR · EN · DE)",
    amac: "Purpose", girdi: "Input", cikti: "Output",
    bolmeler: "Panels & charts here", butonlar: "Clickable controls",
    baglanti: "Linked sections", ac2: "Open guide", kapat2: "Minimize guide",
  },
  de: {
    basla: "Starten", ileri: "Weiter", geri: "Zurück", bitir: "Beenden", bastan: "Neustart",
    oynat: "Autoplay", duraklat: "Pause", cik: "Schließen",
    ac: "Präsentationsmodus", acTitle: "Eine umfassende geführte Tour durch Zweck, Eingabe, Ausgabe, Diagramme und Schaltflächen jedes Bereichs (TR · EN · DE)",
    amac: "Zweck", girdi: "Eingabe", cikti: "Ausgabe",
    bolmeler: "Bereiche & Diagramme hier", butonlar: "Anklickbare Steuerungen",
    baglanti: "Verknüpfte Bereiche", ac2: "Leitfaden öffnen", kapat2: "Leitfaden verkleinern",
  },
};

const ADIMLAR: Adim[] = [
  // ——— GİRİŞ KAPAĞI ———
  {
    no: "1", anahtar: "giris", slug: "ringler", kapak: true,
    metin: {
      tr: { faz: "GENEL BAKIŞ", baslik: "RaySim", anlatim: "Bir raylı sistem hattını gerçek veriyle KURAN, mikroskobik fizik motoruyla SİMÜLE EDEN ve UIC 406 metodolojisiyle RAPORLAYAN bütünleşik karar-destek platformu. Bu rehber her bölmeyi tek tek gezer: ne işe yarar, neyi girdi alır, neye göre çıktı verir ve hangi butonu niye tıklarsın. Akış: Kur → Analiz Et → Sistem → Belgele → Karşılaştır." },
      en: { faz: "OVERVIEW", baslik: "RaySim", anlatim: "An integrated decision-support platform that BUILDS a rail line from real data, SIMULATES it with a microscopic physics engine and REPORTS it with the UIC 406 methodology. This guide walks every section one by one: what it does, what it takes as input, what it bases its output on, and why you press each button. Flow: Build → Analyze → System → Document → Compare." },
      de: { faz: "ÜBERBLICK", baslik: "RaySim", anlatim: "Eine integrierte Entscheidungsplattform, die eine Bahnstrecke aus echten Daten AUFBAUT, mit einem mikroskopischen Physikmodell SIMULIERT und nach UIC-406-Methodik DOKUMENTIERT. Dieser Leitfaden führt durch jeden Bereich: wozu er dient, was er als Eingabe nimmt, worauf seine Ausgabe beruht und warum man jede Schaltfläche drückt. Ablauf: Aufbauen → Analysieren → System → Dokumentieren → Vergleichen." },
    },
  },

  // ——— KUR ———
  {
    no: "2", anahtar: "kur", slug: "ringler", baglanti: ["filo", "kapasite", "belgele"],
    metin: {
      tr: {
        faz: "KUR", baslik: "Hattı tanımla",
        anlatim: "Her şey hattın kendisiyle başlar. Burada kurduğun her değer projeye kalıcı yazılır ve her modülün okuduğu tek gerçek olur.",
        amac: "Tüm simülasyonun tek gerçeği olan hattı kurar: duraklar, durak-arası ring hücreleri, makaslar, geçitler, kurplar, sinyaller, depolar, terminaller ve şubeler.",
        girdi: "Elle giriş ya da tek tıkla içe aktarım: GTFS · railML · CAD (DXF) · Shapefile · OpenStreetMap. Mesafe, saha hızı, makas S/X geometrisi, geçit+TSP, kurp yarıçapı.",
        cikti: "Her modülün okuduğu kalıcı proje hattı + Maksimum Tramvay Kapasitesi (hattaki en fazla tramvay ve adlandırılmış darboğaz).",
        bolmeler: [
          { ad: "Dosyadan İçe Aktar", ne: "GTFS · railML · CAD (DXF) · Shapefile · OSM'den hattı otomatik kurar (makas/sinyal elle eklenir)." },
          { ad: "Duraklar & Mesafeler", ne: "Durak zinciri, durak-arası mesafeler, durak bazlı duruş süresi (oto dwell ya da elle) ve depo işaretleme." },
          { ad: "Ring kartları", ne: "Her durak-arası hücre: makas, yaya/karayolu geçidi + TSP, acil fren, kurp ve sinyal eklenir." },
          { ad: "Şube / Tali Hat", ne: "Bir kavşak durağından dallanan tali hat; ortak kesim yükü + kavşak çakışması." },
          { ad: "Maksimum Tramvay Kapasitesi", ne: "Terminal dönüş tipi + peron + platform bileşenlerinden hattaki en fazla tramvay; darboğazı adlandırır." },
        ],
        butonlar: [
          { ad: "sil · ↺ Silmeyi geri al", ne: "Tüm hattı sıfırlar ya da son silmeyi geri alır." },
          { ad: "Dosya seç (.zip/.xml/.dxf)", ne: "GTFS/Shapefile (.zip), railML (.xml) ya da CAD (.dxf) dosyası yükler." },
          { ad: "ara · getir (OSM)", ne: "Şehir + hat adıyla OpenStreetMap'ten gerçek güzergâhı bulur ve kurar." },
          { ad: "durak zinciri kur · Başa/Sona ekle", ne: "Toplam uzunluk + durak sayısından hızlı zincir ya da tek tek durak ekler." },
          { ad: "oto dwell (durak bazlı) + inen/binen", ne: "Beklemeyi yolcudan otomatik hesaplar: kapı aç + (inen+binen)÷(kapı×genişlik×akış) + kapı kapa, en az min duruş; kapalıyken elle girersin." },
          { ad: "＋ makas · yaya · karayolu · acil fren · kurp · sinyal", ne: "Seçili ring hücresine saha öğesi ekler." },
          { ad: "depo işaretle + araç kuyruğu", ne: "Durağı depo yapar ve park eden araç sayısını belirler." },
          { ad: "⬇ İçe aktar", ne: "Seçili dosya/OSM verisini hatta uygular (+ harita için koordinat/geometri)." },
        ],
      },
      en: {
        faz: "BUILD", baslik: "Define the line",
        anlatim: "Everything starts with the line itself. Every value you set here is stored permanently in the project and becomes the single truth every module reads.",
        amac: "Builds the line that is the single truth of the whole simulation: stops, inter-stop ring cells, switches, crossings, curves, signals, depots, terminals and branches.",
        girdi: "Manual entry or one-click import: GTFS · railML · CAD (DXF) · Shapefile · OpenStreetMap. Distance, field speed, switch S/X geometry, crossing+TSP, curve radius.",
        cikti: "The permanent project line every module reads + Maximum Tram Capacity (most trams the line holds, with a named bottleneck).",
        bolmeler: [
          { ad: "Import from file", ne: "Builds the line automatically from GTFS · railML · CAD (DXF) · Shapefile · OSM (switches/signals added by hand)." },
          { ad: "Stops & distances", ne: "Stop chain, inter-stop distances, per-stop dwell time (auto dwell or manual) and depot flagging." },
          { ad: "Ring cards", ne: "Each inter-stop cell: add switch, pedestrian/road crossing + TSP, emergency brake, curve and signal." },
          { ad: "Branch / spur line", ne: "A spur branching off a junction stop; common-section load + junction conflict." },
          { ad: "Maximum Tram Capacity", ne: "Most trams the line holds from terminal turnback type + platforms + throat components; names the bottleneck." },
        ],
        butonlar: [
          { ad: "delete · ↺ Undo delete", ne: "Resets the whole line or undoes the last deletion." },
          { ad: "Choose file (.zip/.xml/.dxf)", ne: "Loads a GTFS/Shapefile (.zip), railML (.xml) or CAD (.dxf) file." },
          { ad: "search · fetch (OSM)", ne: "Finds and builds the real route from OpenStreetMap by city + line name." },
          { ad: "build stop chain · add to start/end", ne: "Quick chain from total length + stop count, or add stops one by one." },
          { ad: "auto dwell (per stop) + alight/board", ne: "Computes dwell from passengers: door open + (alight+board)÷(doors×width×flow) + door close, at least min dwell; off = enter manually." },
          { ad: "＋ switch · pedestrian · road · e-brake · curve · signal", ne: "Adds a field element to the selected ring cell." },
          { ad: "flag depot + vehicle queue", ne: "Marks a stop as a depot and sets the parked vehicle count." },
          { ad: "⬇ Import", ne: "Applies the selected file/OSM data to the line (+ coordinates/geometry for the map)." },
        ],
      },
      de: {
        faz: "AUFBAUEN", baslik: "Strecke definieren",
        anlatim: "Alles beginnt mit der Strecke selbst. Jeder hier gesetzte Wert wird dauerhaft im Projekt gespeichert und ist die einzige Wahrheit, die jedes Modul liest.",
        amac: "Baut die Strecke als einzige Wahrheit der gesamten Simulation: Haltestellen, Abschnitte, Weichen, Übergänge, Bögen, Signale, Depots, Endstellen und Äste.",
        girdi: "Manuelle Eingabe oder Import per Klick: GTFS · railML · CAD (DXF) · Shapefile · OpenStreetMap. Entfernung, Streckengeschwindigkeit, Weichen-S/X-Geometrie, Übergang+TSP, Bogenradius.",
        cikti: "Die dauerhafte Projektstrecke, die jedes Modul liest + maximale Straßenbahnkapazität (meiste Fahrzeuge der Strecke, mit benanntem Engpass).",
        bolmeler: [
          { ad: "Aus Datei importieren", ne: "Baut die Strecke automatisch aus GTFS · railML · CAD (DXF) · Shapefile · OSM (Weichen/Signale von Hand)." },
          { ad: "Haltestellen & Entfernungen", ne: "Haltestellenkette, Abstände, Haltezeit je Halt (Auto-Haltezeit oder manuell) und Depot-Markierung." },
          { ad: "Abschnittskarten", ne: "Jeder Abschnitt: Weiche, Fußgänger-/Straßenübergang + TSP, Notbremse, Bogen und Signal." },
          { ad: "Ast / Zweigstrecke", ne: "Ein Ast an einer Kreuzungshaltestelle; gemeinsame Last + Kreuzungskonflikt." },
          { ad: "Maximale Straßenbahnkapazität", ne: "Meiste Fahrzeuge aus Wendetyp + Bahnsteigen + Halsbelegung; benennt den Engpass." },
        ],
        butonlar: [
          { ad: "löschen · ↺ Löschen rückgängig", ne: "Setzt die ganze Strecke zurück oder macht die letzte Löschung rückgängig." },
          { ad: "Datei wählen (.zip/.xml/.dxf)", ne: "Lädt GTFS/Shapefile (.zip), railML (.xml) oder CAD (.dxf)." },
          { ad: "suchen · holen (OSM)", ne: "Findet und baut die echte Route aus OpenStreetMap per Stadt + Linienname." },
          { ad: "Kette bauen · vorn/hinten einfügen", ne: "Schnelle Kette aus Länge + Anzahl oder Haltestellen einzeln." },
          { ad: "Auto-Haltezeit (je Halt) + Aus/Ein", ne: "Berechnet die Haltezeit aus Fahrgästen: Tür auf + (Aus+Ein)÷(Türen×Breite×Fluss) + Tür zu, mind. Min-Haltezeit; aus = manuell eingeben." },
          { ad: "＋ Weiche · Fußgänger · Straße · Notbremse · Bogen · Signal", ne: "Fügt dem gewählten Abschnitt ein Streckenelement hinzu." },
          { ad: "Depot markieren + Fahrzeugschlange", ne: "Macht eine Haltestelle zum Depot und setzt die geparkte Fahrzeugzahl." },
          { ad: "⬇ Importieren", ne: "Wendet Datei/OSM-Daten auf die Strecke an (+ Koordinaten/Geometrie für die Karte)." },
        ],
      },
    },
  },

  // ——— ANALİZ · FİLO ———
  {
    no: "3", anahtar: "filo", slug: "sefer", sekme: "sf-t1", baglanti: ["kur", "canli", "karar", "risk"],
    metin: {
      tr: {
        faz: "ANALİZ · FİLO", baslik: "Önerilen filoyu belirle",
        anlatim: "Sefer modülü hattı işletmeye çevirir. Sistem gereken tramvay sayısını önerir; onayladığında filo öneriye eşitlenir.",
        amac: "Hattı işletmeye çevirir: gereken tramvay sayısını önerir, filoyu belirler ve araçları depolara elle parklar.",
        girdi: "Çevrim süresi (RTT), hedef sefer aralığı, yolcu talebi, çeken araç fiziği ve duruş süresi.",
        cikti: "Önerilen filo = ⌈RTT ÷ hedef aralık⌉; ulaşılan aralık = çevrim ÷ filo; kapasite kontrolü ve parklanma dizilimi.",
        bolmeler: [
          { ad: "Filo & Öneri", ne: "Önerilen filo, ulaşılan aralık ve kapasite; 'Onayla' filoyu öneriye eşitler; araçlar depolara elle parklanır." },
          { ad: "Çeken Araç", ne: "Araç ön-ayarı + hız/kütle/fren/güç/Davis; tüm motorların kullandığı fizik; tutarlılık uyarısı." },
          { ad: "Yolcu Dinamiği & Duruş Süresi", ne: "Konfor, yolcu akış hızı ve kapı özellikleri → net alan, kapasite ve otomatik duruş süresi." },
        ],
        butonlar: [
          { ad: "✓ Onayla — filoyu öneriye eşitle", ne: "Çalışan filoyu önerilen sayıya ayarlar ve onaylandı işaretler." },
          { ad: "− / + filo", ne: "Çalışan filoyu (park toplamı) elle artırır/azaltır." },
          { ad: "yolcu verisi gir", ne: "Durak bazlı iniş/biniş yolcu verisini açar." },
          { ad: "eşit dağıt", ne: "Araçları depolara eşit paylaştırır." },
          { ad: "araç ön-ayarı seç", ne: "Hazır tramvay modelinin fiziğini yükler." },
        ],
      },
      en: {
        faz: "ANALYZE · FLEET", baslik: "Set the recommended fleet",
        anlatim: "The Service module turns the line into an operation. It recommends the required number of trams; once confirmed, the fleet is set to it.",
        amac: "Turns the line into an operation: recommends the required number of trams, sets the fleet, and parks vehicles into depots by hand.",
        girdi: "Cycle time (RTT), target headway, passenger demand, traction-vehicle physics and dwell time.",
        cikti: "Recommended fleet = ⌈RTT ÷ target headway⌉; achieved headway = cycle ÷ fleet; capacity check and parking layout.",
        bolmeler: [
          { ad: "Fleet & Recommendation", ne: "Recommended fleet, achieved headway and capacity; 'Confirm' sets fleet to the recommendation; vehicles parked by hand." },
          { ad: "Traction Vehicle", ne: "Vehicle preset + speed/mass/braking/power/Davis; the physics every engine uses; consistency warning." },
          { ad: "Passenger Dynamics & Dwell Time", ne: "Comfort, pax flow rate and door specs → net area, capacity and automatic dwell time." },
        ],
        butonlar: [
          { ad: "✓ Confirm — set fleet to recommendation", ne: "Sets the running fleet to the recommended count and marks it confirmed." },
          { ad: "− / + fleet", ne: "Manually raises/lowers the running fleet (parking total)." },
          { ad: "enter passenger data", ne: "Opens per-stop board/alight passenger data." },
          { ad: "distribute evenly", ne: "Splits vehicles evenly across depots." },
          { ad: "select vehicle preset", ne: "Loads the physics of a ready tram model." },
        ],
      },
      de: {
        faz: "ANALYSE · FLOTTE", baslik: "Empfohlene Flotte festlegen",
        anlatim: "Das Betriebsmodul macht aus der Strecke einen Betrieb. Es empfiehlt die nötige Zahl an Fahrzeugen; nach Bestätigung wird die Flotte darauf gesetzt.",
        amac: "Macht aus der Strecke einen Betrieb: empfiehlt die nötige Fahrzeugzahl, legt die Flotte fest und stellt Fahrzeuge von Hand in Depots.",
        girdi: "Umlaufzeit (RTT), Ziel-Zugfolgezeit, Fahrgastnachfrage, Fahrzeugphysik und Haltezeit.",
        cikti: "Empfohlene Flotte = ⌈RTT ÷ Ziel-Zugfolgezeit⌉; erreichte Zugfolgezeit = Umlauf ÷ Flotte; Kapazitätsprüfung und Abstellplan.",
        bolmeler: [
          { ad: "Flotte & Empfehlung", ne: "Empfohlene Flotte, erreichte Zugfolgezeit und Kapazität; 'Bestätigen' setzt die Flotte auf die Empfehlung; Fahrzeuge von Hand abstellen." },
          { ad: "Triebfahrzeug", ne: "Fahrzeug-Preset + Geschwindigkeit/Masse/Bremsung/Leistung/Davis; die Physik jedes Modells; Konsistenzwarnung." },
          { ad: "Fahrgastdynamik & Haltezeit", ne: "Komfort, Fahrgastflussrate und Türspezifikationen → Nettofläche, Kapazität und automatische Haltezeit." },
        ],
        butonlar: [
          { ad: "✓ Bestätigen — Flotte = Empfehlung", ne: "Setzt die laufende Flotte auf die empfohlene Zahl und markiert sie als bestätigt." },
          { ad: "− / + Flotte", ne: "Erhöht/senkt die laufende Flotte (Abstellsumme) von Hand." },
          { ad: "Fahrgastdaten eingeben", ne: "Öffnet Ein-/Ausstieg je Haltestelle." },
          { ad: "gleich verteilen", ne: "Verteilt Fahrzeuge gleichmäßig auf die Depots." },
          { ad: "Fahrzeug-Preset wählen", ne: "Lädt die Physik eines fertigen Straßenbahnmodells." },
        ],
      },
    },
  },

  // ——— ANALİZ · CANLI ———
  {
    no: "4", anahtar: "canli", slug: "sefer", sekme: "sf-t2", tikla: ["filo-onayla", "harita"], hedefId: "canli", baglanti: ["filo", "grafik", "karar", "kapasite"],
    metin: {
      tr: {
        faz: "ANALİZ · CANLI", baslik: "Gerçek haritada işlet",
        anlatim: "Aynı ağı gerçek haritada, çift-ray gidiş-geliş olarak canlı izle (mavi gidiş · turuncu dönüş). Bir işarete tıkla → detay.",
        amac: "Kurulan ağı gerçek harita ya da şema üzerinde canlı işletir; her aracı, durumunu ve sinyali gösterir.",
        girdi: "Kurulan hat, onaylı filo, depolar, ulaşılan aralık, sinyal blokları ve koordinatlar (işleyen hatta OSM'den otomatik).",
        cikti: "Animasyonlu tren konumları, 3-renkli sinyaller, kurp konforu ve araca tıkla → gecikme neden dökümü.",
        bolmeler: [
          { ad: "Canlı Ağ Simülasyonu", ne: "Şematik şerit ya da coğrafi harita; araç durum rozetleri, 3-aspektli sinyaller, çakışmasız çizelge." },
          { ad: "Ters İşletme", ne: "Makaslardan kısa dönüş / ters-yön işletme analizi." },
          { ad: "Tarife", ne: "Çevrim ve aralıktan kalkış çizelgesini üretir." },
        ],
        butonlar: [
          { ad: "Şematik / Harita", ne: "Canlı görünümü şema ↔ gerçek harita arasında değiştirir." },
          { ad: "Koordinat gir", ne: "Elle enlem/boylam girişi panelini açar." },
          { ad: "Çakışmasız çizelge", ne: "Tek-hat için kalkış offset'li çakışmasız çizelgeyi uygular." },
          { ad: "⤓ OSM'den çek", ne: "Durak koordinat + geometrisini OpenStreetMap'ten getirir (hattı değiştirmez)." },
          { ad: "⬇ CAD verisini içe aktar", ne: "Bu hattın GTFS/CAD koordinatını yükler." },
          { ad: "blok tıkla · Arızayı temizle", ne: "Blokta arıza oluşturur/temizler; etkisini canlı izlersin." },
        ],
      },
      en: {
        faz: "ANALYZE · LIVE", baslik: "Run on the real map",
        anlatim: "Watch the same network live on a real map as two-track there-and-back (blue outbound · orange return). Click any marker for detail.",
        amac: "Runs the built network live on a real map or schematic; shows every vehicle, its state and the signals.",
        girdi: "The built line, confirmed fleet, depots, achieved headway, signal blocks and coordinates (auto from OSM for an operating line).",
        cikti: "Animated train positions, 3-aspect signals, curve comfort and — click a train — a delay cause breakdown.",
        bolmeler: [
          { ad: "Live Network Simulation", ne: "Schematic strip or geographic map; vehicle state badges, 3-aspect signals, conflict-free schedule." },
          { ad: "Reverse Operation", ne: "Short-turn / reverse-running analysis at switches." },
          { ad: "Timetable", ne: "Produces the departure schedule from cycle and headway." },
        ],
        butonlar: [
          { ad: "Schematic / Map", ne: "Switches the live view between schematic and real map." },
          { ad: "Enter coordinates", ne: "Opens the manual latitude/longitude panel." },
          { ad: "Conflict-free schedule", ne: "Applies departure offsets for a clash-free single-track schedule." },
          { ad: "⤓ Fetch from OSM", ne: "Gets stop coordinates + geometry from OpenStreetMap (does not change the line)." },
          { ad: "⬇ Import CAD data", ne: "Loads this line's GTFS/CAD coordinates." },
          { ad: "click a block · Clear fault", ne: "Creates/clears a fault on a block; you watch the effect live." },
        ],
      },
      de: {
        faz: "ANALYSE · LIVE", baslik: "Auf der echten Karte fahren",
        anlatim: "Dasselbe Netz live auf einer echten Karte als zweigleisigen Hin- und Rücklauf (blau hin · orange zurück). Für Details ein Symbol anklicken.",
        amac: "Fährt das gebaute Netz live auf echter Karte oder Schema; zeigt jedes Fahrzeug, seinen Zustand und die Signale.",
        girdi: "Die gebaute Strecke, bestätigte Flotte, Depots, erreichte Zugfolgezeit, Signalblöcke und Koordinaten (bei Bestandsstrecke automatisch aus OSM).",
        cikti: "Animierte Zugpositionen, 3-begriffige Signale, Bogenkomfort und — Zug anklicken — eine Verspätungsursachen-Aufschlüsselung.",
        bolmeler: [
          { ad: "Live-Netzsimulation", ne: "Schematischer Streifen oder geografische Karte; Fahrzeug-Zustandsabzeichen, 3-begriffige Signale, konfliktfreier Fahrplan." },
          { ad: "Kehrbetrieb", ne: "Kehr-/Gegenrichtungs-Analyse an Weichen." },
          { ad: "Fahrplan", ne: "Erzeugt den Abfahrplan aus Umlauf und Zugfolgezeit." },
        ],
        butonlar: [
          { ad: "Schema / Karte", ne: "Wechselt die Live-Ansicht zwischen Schema und echter Karte." },
          { ad: "Koordinaten eingeben", ne: "Öffnet das manuelle Breiten-/Längengrad-Panel." },
          { ad: "Konfliktfreier Fahrplan", ne: "Wendet Abfahrtsversätze für einen konfliktfreien Eingleis-Fahrplan an." },
          { ad: "⤓ Aus OSM holen", ne: "Holt Haltestellenkoordinaten + Geometrie aus OpenStreetMap (ändert die Strecke nicht)." },
          { ad: "⬇ CAD-Daten importieren", ne: "Lädt die GTFS/CAD-Koordinaten dieser Strecke." },
          { ad: "Block anklicken · Störung löschen", ne: "Erzeugt/löscht eine Störung an einem Block; Wirkung live sichtbar." },
        ],
      },
    },
  },

  // ——— ANALİZ · GRAFİK ———
  {
    no: "5", anahtar: "grafik", slug: "sefer", sekme: "sf-t3", baglanti: ["canli", "filo", "kapasite"],
    metin: {
      tr: {
        faz: "ANALİZ · GRAFİK", baslik: "Mühendislik grafikleri",
        anlatim: "Klasik demiryolu analizi tek yerde. Tüm grafikler canlı simülasyonla BİREBİR aynı veriden türer.",
        amac: "Hattı mühendislik diliyle görünür kılar: zaman-mesafe, gecikme, hız ve yük/talep ilişkilerini canlı veriden çizer.",
        girdi: "Döngü yörüngesi, çakışmalar, durak yük verisi, yolcu talebi ve doluluk hedefi.",
        cikti: "Her grafik kendi özetiyle: çizelge çakışması, ikincil gecikme, hız kısıtı, yoğun kesim ve doluluk zinciri.",
        bolmeler: [
          { ad: "Bildfahrplan (Zaman–Mesafe / Marey)", ne: "Her tren bir çizgi; eğim=hız, yatay=duruş, kesişim=karşılaşma. Girdi: döngü+çakışma → Çıktı: çizelge çakışma özeti." },
          { ad: "Gecikme Yayılımı (Knock-on)", ne: "Bir trenin gecikmesinin diğerlerine zinciri. Girdi: hedef tren + birincil gecikme → Çıktı: etkilenen tren, maks/toplam ikincil gecikme." },
          { ad: "Hız Profili v(x)", ne: "Gerçek hız ile hız-sınırı zarfı. Girdi: döngü yörüngesi → Çıktı: hızı durak/makas/kurpun nerede bağladığı." },
          { ad: "Yük & Duruş Analizi", ne: "Yük profili (yolcu/saat, dolulukla renkli) + duruş dökümü. Girdi: durak yük verisi → Çıktı: en yoğun kesim, zaman dağılımı." },
          { ad: "Talep → Gereken Filo → Doluluk", ne: "Talepten hedef dolulukta gereken filo ve ulaşılan doluluk. Girdi: talep + doluluk hedefi → Çıktı: zincir." },
        ],
        butonlar: [
          { ad: "hedef tren seç · birincil gecikme", ne: "Gecikme yayılımı grafiğini sürer (hangi tren, ne kadar gecikme)." },
        ],
      },
      en: {
        faz: "ANALYZE · CHARTS", baslik: "Engineering charts",
        anlatim: "Classic railway analysis in one place. Every chart derives from exactly the same data as the live simulation.",
        amac: "Makes the line visible in engineering language: draws time–distance, delay, speed and load/demand relationships from live data.",
        girdi: "Loop trajectory, conflicts, per-stop load data, passenger demand and occupancy target.",
        cikti: "Each chart with its own summary: schedule conflict, secondary delay, speed constraint, busiest section and occupancy chain.",
        bolmeler: [
          { ad: "Bildfahrplan (Time–Distance / Marey)", ne: "Each train a line; slope=speed, horizontal=dwell, crossing=meet. Input: loop+conflicts → Output: schedule-conflict summary." },
          { ad: "Delay Propagation (Knock-on)", ne: "One train's delay chaining to others. Input: target train + primary delay → Output: affected trains, max/total secondary delay." },
          { ad: "Speed Profile v(x)", ne: "Actual speed vs speed-limit envelope. Input: loop trajectory → Output: where station/switch/curve binds speed." },
          { ad: "Load & Dwell Analysis", ne: "Load profile (pax/h, occupancy-coloured) + dwell breakdown. Input: per-stop load → Output: busiest section, time allocation." },
          { ad: "Demand → Required Fleet → Occupancy", ne: "From demand to required fleet at target occupancy and achieved occupancy. Input: demand + target → Output: the chain." },
        ],
        butonlar: [
          { ad: "select target train · primary delay", ne: "Drives the delay-propagation chart (which train, how much delay)." },
        ],
      },
      de: {
        faz: "ANALYSE · DIAGRAMME", baslik: "Ingenieur-Diagramme",
        anlatim: "Klassische Eisenbahnanalyse an einem Ort. Jedes Diagramm stammt aus genau denselben Daten wie die Live-Simulation.",
        amac: "Macht die Strecke in Ingenieursprache sichtbar: zeichnet Zeit-Weg-, Verspätungs-, Geschwindigkeits- und Last-/Nachfragebeziehungen aus Live-Daten.",
        girdi: "Umlauf-Trajektorie, Konflikte, Lastdaten je Haltestelle, Fahrgastnachfrage und Auslastungsziel.",
        cikti: "Jedes Diagramm mit eigener Zusammenfassung: Fahrplankonflikt, Folgeverspätung, Geschwindigkeitsengpass, stärkster Abschnitt und Auslastungskette.",
        bolmeler: [
          { ad: "Bildfahrplan (Zeit–Weg / Marey)", ne: "Jeder Zug eine Linie; Steigung=Geschwindigkeit, waagerecht=Halt, Kreuzung=Begegnung. Eingabe: Umlauf+Konflikte → Ausgabe: Fahrplankonflikt." },
          { ad: "Verspätungsausbreitung (Folge)", ne: "Verspätung eines Zuges verkettet auf andere. Eingabe: Zielzug + Primärverspätung → Ausgabe: betroffene Züge, max/gesamt." },
          { ad: "Geschwindigkeitsprofil v(x)", ne: "Istgeschwindigkeit vs. Grenzkurve. Eingabe: Umlauf-Trajektorie → Ausgabe: wo Halt/Weiche/Bogen die Geschwindigkeit bindet." },
          { ad: "Last- & Halteanalyse", ne: "Lastprofil (Fahrgäste/h, nach Auslastung gefärbt) + Halteaufschlüsselung. Eingabe: Last je Haltestelle → Ausgabe: stärkster Abschnitt." },
          { ad: "Nachfrage → nötige Flotte → Auslastung", ne: "Von Nachfrage zu nötiger Flotte bei Zielauslastung und erreichter Auslastung. Eingabe: Nachfrage + Ziel → Ausgabe: die Kette." },
        ],
        butonlar: [
          { ad: "Zielzug wählen · Primärverspätung", ne: "Steuert das Verspätungsausbreitungs-Diagramm (welcher Zug, wie viel Verspätung)." },
        ],
      },
    },
  },

  // ——— ANALİZ · RİSK ———
  {
    no: "6", anahtar: "risk", slug: "sefer", sekme: "sf-t4", baglanti: ["filo", "karar", "canli"],
    metin: {
      tr: {
        faz: "ANALİZ · RİSK", baslik: "Etkiler & dayanıklılık",
        anlatim: "Filoyu oynattıkça etkiler canlı güncellenir; Monte-Carlo, rastgele gecikmelere karşı gereken minimum filoyu verir.",
        amac: "Seçilen filonun gerçek etkilerini ölçer ve rastgele gecikmelere karşı dayanıklılığı sınar.",
        girdi: "Güncel filo; ortalama giriş gecikmesi ve duruş sapması; 150 seferlik Monte-Carlo.",
        cikti: "Ulaşılan sıklık, kapasite/park aşımı, tıkanan duraklar; dakiklik ≤2dk, ortalama, P90, en kötü gecikme + histogram; kısa dönüş önerileri.",
        bolmeler: [
          { ad: "Canlı Etkiler & Öneriler", ne: "4 KPI (sıklık, kapasite, parklanma, tıkanma) + kısa dönüş öneri listesi." },
          { ad: "Sefer & Ters İşletme — Entegre", ne: "Elle aralık + zaman çubuğu; gerçek araca bağlı kısa dönüş kararı ve kazancı." },
          { ad: "Monte-Carlo Gecikme Analizi", ne: "Gecikme girdileriyle 150 sefer; dakiklik istatistiği + histogram." },
        ],
        butonlar: [
          { ad: "150 sefer simüle et", ne: "Monte-Carlo dayanıklılık koşusunu başlatır." },
          { ad: "ort. giriş gecikmesi · duruş sapması", ne: "Rastgele gecikme senaryosunun girdileri." },
          { ad: "aralık · zaman çubuğu (entegre)", ne: "Ters işletme senaryosunu zaman üzerinde oynatır." },
        ],
      },
      en: {
        faz: "ANALYZE · RISK", baslik: "Effects & robustness",
        anlatim: "As you change the fleet, effects update live; Monte-Carlo gives the minimum fleet needed against random delays.",
        amac: "Measures the real effects of the chosen fleet and tests robustness against random delays.",
        girdi: "Current fleet; average entry delay and dwell deviation; a 150-run Monte-Carlo.",
        cikti: "Achieved frequency, capacity/parking overflow, congested stops; punctuality ≤2min, average, P90, worst delay + histogram; short-turn suggestions.",
        bolmeler: [
          { ad: "Live Effects & Recommendations", ne: "4 KPIs (frequency, capacity, parking, congestion) + short-turn suggestion list." },
          { ad: "Service & Reverse — Integrated", ne: "Manual headway + time bar; short-turn decision bound to the real vehicle with its gain." },
          { ad: "Monte-Carlo Delay Analysis", ne: "150 runs from delay inputs; punctuality stats + histogram." },
        ],
        butonlar: [
          { ad: "simulate 150 runs", ne: "Starts the Monte-Carlo robustness run." },
          { ad: "avg entry delay · dwell deviation", ne: "Inputs of the random delay scenario." },
          { ad: "headway · time bar (integrated)", ne: "Plays the reverse-operation scenario over time." },
        ],
      },
      de: {
        faz: "ANALYSE · RISIKO", baslik: "Auswirkungen & Robustheit",
        anlatim: "Wenn Sie die Flotte ändern, aktualisieren sich die Auswirkungen live; Monte-Carlo liefert die minimale Flotte gegen zufällige Verspätungen.",
        amac: "Misst die realen Auswirkungen der gewählten Flotte und prüft die Robustheit gegen zufällige Verspätungen.",
        girdi: "Aktuelle Flotte; mittlere Einfahrverspätung und Halteabweichung; ein 150-Läufe-Monte-Carlo.",
        cikti: "Erreichte Taktzeit, Kapazitäts-/Abstellüberlauf, überlastete Haltestellen; Pünktlichkeit ≤2min, Mittel, P90, schlimmste Verspätung + Histogramm; Kehrvorschläge.",
        bolmeler: [
          { ad: "Live-Auswirkungen & Empfehlungen", ne: "4 KPIs (Takt, Kapazität, Abstellung, Überlastung) + Kehrvorschlagsliste." },
          { ad: "Betrieb & Kehr — Integriert", ne: "Manuelle Zugfolgezeit + Zeitleiste; an das reale Fahrzeug gebundene Kehrentscheidung mit Gewinn." },
          { ad: "Monte-Carlo-Verspätungsanalyse", ne: "150 Läufe aus Verspätungseingaben; Pünktlichkeitsstatistik + Histogramm." },
        ],
        butonlar: [
          { ad: "150 Läufe simulieren", ne: "Startet den Monte-Carlo-Robustheitslauf." },
          { ad: "mittl. Einfahrverspätung · Halteabweichung", ne: "Eingaben des Zufallsverspätungsszenarios." },
          { ad: "Zugfolgezeit · Zeitleiste (integriert)", ne: "Spielt das Kehrbetriebsszenario über die Zeit ab." },
        ],
      },
    },
  },

  // ——— SİSTEM · KAPASİTE ———
  {
    no: "7", anahtar: "kapasite", slug: "sistem", sekme: "sm-t1", baglanti: ["kur", "terminal", "karar", "dogrulama"],
    metin: {
      tr: {
        faz: "SİSTEM · KAPASİTE", baslik: "Kapasite & kısıt",
        anlatim: "Hattı fiziksel olarak ne bağlıyor? Belirleyici kısıt, blocking-time ve kilitleme tablosu burada.",
        amac: "Hattın kapasitesini fiziksel olarak hangi etkenin bağladığını kanonik yöntemle (Sperrzeit, UIC 406) gösterir.",
        girdi: "Rakip headway kısıtları (blok · terminal · tek-hat · kavşak · sinyal), blok geometrisi ve UIC 406 doluluk.",
        cikti: "Hangi etkenin bağladığı + pay; Sperrzeitentreppe merdiveni; blok başına 6 bileşen; blok teşhisi+çözüm; kilitleme kontrol tablosu.",
        bolmeler: [
          { ad: "Belirleyici Kısıt", ne: "5 rakip kısıtın çubuğu; en uzun olan bağlar. İsteğe bağlı kavşak Sperrzeit dökümü." },
          { ad: "Sperrzeitentreppe & UIC 406", ne: "Zaman-mesafe merdiveni (iki tren kritik blokta değer → min aralık); min headway, teorik/işletme kapasitesi, UIC doluluk." },
          { ad: "Blok başına blocking-time bileşenleri", ne: "6 parça yığını: kurulum · görüş · yaklaşma · seyir · boşaltma · serbest." },
          { ad: "Blok Teşhisi & Çözüm", ne: "Blok bazlı neden + çözüm; darboğazı ilgili modülde açan düzelt butonları." },
          { ad: "Kilitleme Kontrol Tablosu", ne: "Rota kurulumu · makas konumu · kilit tablosu (interlocking)." },
        ],
        butonlar: [
          { ad: "→ Ringler'de düzelt · → Sefer'de düzelt", ne: "Darboğaz bloğunu ilgili modülde açar." },
          { ad: "çekmeceleri aç", ne: "Sperrzeitentreppe · bileşen · teşhis · kilitleme çekmecelerini açar." },
        ],
      },
      en: {
        faz: "SYSTEM · CAPACITY", baslik: "Capacity & constraint",
        anlatim: "What physically limits the line? The governing constraint, blocking-time and interlocking table are here.",
        amac: "Shows, by canonical methods (Sperrzeit, UIC 406), which factor physically binds the line's capacity.",
        girdi: "Competing headway constraints (block · terminal · single-track · junction · signal), block geometry and UIC 406 occupancy.",
        cikti: "Which factor binds + margin; Sperrzeitentreppe staircase; 6 components per block; block diagnosis+fix; interlocking control table.",
        bolmeler: [
          { ad: "Governing Constraint", ne: "Bar chart of 5 competing constraints; the longest binds. Optional junction Sperrzeit breakdown." },
          { ad: "Sperrzeitentreppe & UIC 406", ne: "Time-distance staircase (two trains touch at the critical block → min headway); min headway, theoretical/operating capacity, UIC occupancy." },
          { ad: "Blocking-time components per block", ne: "Stack of 6 parts: setup · sighting · approach · running · clearing · release." },
          { ad: "Block Diagnosis & Fix", ne: "Per-block cause + fix; buttons that open the bottleneck in the relevant module." },
          { ad: "Interlocking Control Table", ne: "Route setting · switch position · lock table." },
        ],
        butonlar: [
          { ad: "→ Fix in Ringler · → Fix in Service", ne: "Opens the bottleneck block in the relevant module." },
          { ad: "open drawers", ne: "Opens the Sperrzeitentreppe · components · diagnosis · interlocking drawers." },
        ],
      },
      de: {
        faz: "SYSTEM · KAPAZITÄT", baslik: "Kapazität & Engpass",
        anlatim: "Was begrenzt die Strecke physikalisch? Der maßgebende Engpass, die Sperrzeit und die Verschlusstabelle sind hier.",
        amac: "Zeigt mit kanonischen Methoden (Sperrzeit, UIC 406), welcher Faktor die Kapazität der Strecke physikalisch bindet.",
        girdi: "Konkurrierende Zugfolgezeit-Engpässe (Block · Endstelle · Eingleis · Kreuzung · Signal), Blockgeometrie und UIC-406-Auslastung.",
        cikti: "Welcher Faktor bindet + Reserve; Sperrzeitentreppe; 6 Komponenten je Block; Blockdiagnose+Lösung; Verschlusstabelle.",
        bolmeler: [
          { ad: "Maßgebender Engpass", ne: "Balken von 5 konkurrierenden Engpässen; der längste bindet. Optionale Kreuzungs-Sperrzeit-Aufschlüsselung." },
          { ad: "Sperrzeitentreppe & UIC 406", ne: "Zeit-Weg-Treppe (zwei Züge berühren sich am kritischen Block → min. Zugfolgezeit); min. Zugfolgezeit, theoretische/betriebliche Kapazität, UIC-Auslastung." },
          { ad: "Sperrzeit-Komponenten je Block", ne: "Stapel aus 6 Teilen: Einstellung · Sicht · Annäherung · Fahrt · Räumung · Auflösung." },
          { ad: "Blockdiagnose & Lösung", ne: "Ursache + Lösung je Block; Schaltflächen öffnen den Engpass im zuständigen Modul." },
          { ad: "Verschlusstabelle (Interlocking)", ne: "Fahrstraßeneinstellung · Weichenlage · Verschlusstabelle." },
        ],
        butonlar: [
          { ad: "→ In Ringler beheben · → In Betrieb beheben", ne: "Öffnet den Engpassblock im zuständigen Modul." },
          { ad: "Schubladen öffnen", ne: "Öffnet die Schubladen Sperrzeitentreppe · Komponenten · Diagnose · Verschluss." },
        ],
      },
    },
  },

  // ——— SİSTEM · TERMİNAL ———
  {
    no: "8", anahtar: "terminal", slug: "sistem", sekme: "sm-t2", baglanti: ["kur", "kapasite", "karar"],
    metin: {
      tr: {
        faz: "SİSTEM · TERMİNAL", baslik: "Terminal & yol etkileri",
        anlatim: "Tramvay hatlarını çoğu kez terminal dönüşü bağlar: turnback kapasitesi makas geometrisi ve peron sayısından hesaplanır.",
        amac: "Terminal dönüşünün (turnback) kapasitesini ve hangi ucun hattı bağladığını ortaya koyar.",
        girdi: "Terminal makas geometrisi (S/X sayısı), peron sayısı ve platform işgal bileşenleri (varış/iniş/ters/kalkış/toparlanma).",
        cikti: "Her iki terminal ucunun turnback kapasitesi; hangi uç ve hangi alt-etken bağlar.",
        bolmeler: [
          { ad: "Terminal Turnback Kapasitesi", ne: "İki terminal ucu yan yana; S/X geometrisi + peron + boğaz işgalinden dönüş kapasitesi ve belirleyici alt-etken." },
        ],
        butonlar: [
          { ad: "(bu bölmede ayar yoktur)", ne: "Terminal dönüş tipi, peron ve platform bileşenleri Ringler · Maksimum Tramvay Kapasitesi'nde ayarlanır." },
        ],
      },
      en: {
        faz: "SYSTEM · TERMINAL", baslik: "Terminal & line effects",
        anlatim: "Tram lines are most often bound by the terminal turnback: capacity is computed from switch geometry and platform count.",
        amac: "Reveals the terminal turnback capacity and which end binds the line.",
        girdi: "Terminal switch geometry (S/X count), platform count and throat-occupancy components (arrival/alight/reverse/departure/recovery).",
        cikti: "Turnback capacity of both terminal ends; which end and which sub-factor governs.",
        bolmeler: [
          { ad: "Terminal Turnback Capacity", ne: "Two terminal ends side by side; turnback capacity from S/X geometry + platforms + throat occupancy, and the governing sub-factor." },
        ],
        butonlar: [
          { ad: "(no settings in this pane)", ne: "Turnback type, platforms and throat components are set in Ringler · Maximum Tram Capacity." },
        ],
      },
      de: {
        faz: "SYSTEM · ENDSTELLE", baslik: "Endstellen- & Streckeneffekte",
        anlatim: "Straßenbahnstrecken werden meist durch die Wende begrenzt: die Kapazität ergibt sich aus Weichengeometrie und Bahnsteigzahl.",
        amac: "Zeigt die Wendekapazität der Endstelle und welches Ende die Strecke bindet.",
        girdi: "Weichengeometrie der Endstelle (S/X-Zahl), Bahnsteigzahl und Halsbelegungskomponenten (Ankunft/Ausstieg/Kehr/Abfahrt/Erholung).",
        cikti: "Wendekapazität beider Endstellen; welches Ende und welcher Teilfaktor maßgebend ist.",
        bolmeler: [
          { ad: "Endstellen-Wendekapazität", ne: "Zwei Enden nebeneinander; Wendekapazität aus S/X-Geometrie + Bahnsteigen + Halsbelegung und der maßgebende Teilfaktor." },
        ],
        butonlar: [
          { ad: "(in diesem Bereich keine Einstellung)", ne: "Wendetyp, Bahnsteige und Halskomponenten werden in Ringler · Maximale Straßenbahnkapazität gesetzt." },
        ],
      },
    },
  },

  // ——— SİSTEM · KARAR (sm-t3 = Filo Kararı) ———
  {
    no: "9", anahtar: "karar", slug: "sistem", sekme: "sm-t3", baglanti: ["filo", "risk", "kapasite"],
    metin: {
      tr: {
        faz: "SİSTEM · KARAR", baslik: "Filo & kapasite kararı",
        anlatim: "Aynı temel kapasiteden iki karar: operasyonel (istenen aralığı hangi filo verir) ve risk (gecikmeye rağmen minimum filo).",
        amac: "Kapasite verisini somut filo kararına çevirir ve tek-hat çakışmasını çizelgeyle çözer.",
        girdi: "Temel kapasite (çevrim, min headway, nTeorik, önerilen filo); istenen sefer aralığı; gecikme profili.",
        cikti: "Operasyonel: istenen aralığı veren filo; Risk: gecikmeye rağmen güvenilirlik+konfor için minimum filo; tek-hat için çakışmasız çizelge.",
        bolmeler: [
          { ad: "Filo Kararı (Karar Destek)", ne: "Operasyonel karar: filo ↔ aralık hedef araması — istenen aralığı hangi filo verir." },
          { ad: "Robust Filo", ne: "Risk kararı: Monte-Carlo ile gecikmeye rağmen güvenilirlik+konfor için minimum filo." },
          { ad: "Çakışma Çözücüsü (tek hat)", ne: "Kalkış offset'i ile tek-hat çakışmasını giderip çakışmasız çizelge üretir." },
        ],
        butonlar: [
          { ad: "filo · aralık hedefi", ne: "Operasyonel kararda hedefe göre çözer." },
          { ad: "çakışma çöz", ne: "Tek-hat çakışmasını kalkış offset'iyle giderir." },
        ],
      },
      en: {
        faz: "SYSTEM · DECISION", baslik: "Fleet & capacity decision",
        anlatim: "Two decisions from the same base capacity: operational (which fleet gives the desired headway) and risk (minimum fleet despite delays).",
        amac: "Turns capacity data into a concrete fleet decision and resolves single-track conflicts with a schedule.",
        girdi: "Base capacity (cycle, min headway, nTheoretical, recommended fleet); desired headway; delay profile.",
        cikti: "Operational: the fleet that gives the desired headway; Risk: minimum fleet for reliability+comfort despite delays; a clash-free single-track schedule.",
        bolmeler: [
          { ad: "Fleet Decision (Decision Support)", ne: "Operational decision: fleet ↔ headway target-seek — which fleet gives the desired headway." },
          { ad: "Robust Fleet", ne: "Risk decision: minimum fleet for reliability+comfort despite delays, via Monte-Carlo." },
          { ad: "Conflict Resolver (single track)", ne: "Removes single-track conflict with departure offsets for a clash-free schedule." },
        ],
        butonlar: [
          { ad: "fleet · headway target", ne: "Solves the operational decision toward the target." },
          { ad: "resolve conflict", ne: "Removes single-track conflict with departure offsets." },
        ],
      },
      de: {
        faz: "SYSTEM · ENTSCHEIDUNG", baslik: "Flotten- & Kapazitätsentscheidung",
        anlatim: "Zwei Entscheidungen aus derselben Grundkapazität: betrieblich (welche Flotte liefert die gewünschte Zugfolgezeit) und Risiko (minimale Flotte trotz Verspätungen).",
        amac: "Macht aus Kapazitätsdaten eine konkrete Flottenentscheidung und löst Eingleiskonflikte per Fahrplan.",
        girdi: "Grundkapazität (Umlauf, min. Zugfolgezeit, nTheoretisch, empfohlene Flotte); gewünschte Zugfolgezeit; Verspätungsprofil.",
        cikti: "Betrieblich: die Flotte für die gewünschte Zugfolgezeit; Risiko: minimale Flotte für Zuverlässigkeit+Komfort trotz Verspätungen; konfliktfreier Eingleis-Fahrplan.",
        bolmeler: [
          { ad: "Flottenentscheidung (Entscheidungshilfe)", ne: "Betrieblich: Flotte ↔ Zugfolgezeit-Zielsuche — welche Flotte liefert die gewünschte Zugfolgezeit." },
          { ad: "Robuste Flotte", ne: "Risiko: minimale Flotte für Zuverlässigkeit+Komfort trotz Verspätungen, per Monte-Carlo." },
          { ad: "Konfliktlöser (Eingleis)", ne: "Beseitigt Eingleiskonflikt mit Abfahrtsversätzen für einen konfliktfreien Fahrplan." },
        ],
        butonlar: [
          { ad: "Flotte · Zugfolgezeit-Ziel", ne: "Löst die betriebliche Entscheidung auf das Ziel hin." },
          { ad: "Konflikt lösen", ne: "Beseitigt Eingleiskonflikt mit Abfahrtsversätzen." },
        ],
      },
    },
  },

  // ——— SİSTEM · DOĞRULAMA (sm-t4 = Doğrulama / V&V) ———
  {
    no: "10", anahtar: "dogrulama", slug: "sistem", sekme: "sm-t4", baglanti: ["kapasite", "belgele"],
    metin: {
      tr: {
        faz: "SİSTEM · DOĞRULAMA", baslik: "Motor doğruluğu",
        anlatim: "Sonuçlara güven: Doğrulama & Geçerleme (V&V) motoru kanonik analitik referanslara karşı sertifikalar — 'AI yapımı' değil, mühendislik disiplinli.",
        amac: "Simülasyon sonuçlarını kanonik analitik referanslarla (UIC 406, Sperrzeit) karşılaştırarak motorun doğruluğunu belgeler.",
        girdi: "Motor çıktıları ve bunlara karşılık gelen kanonik kapalı-form referansları.",
        cikti: "Her kontrol için beklenen / bulunan / sapma değeri ve geçti-kaldı durumu.",
        bolmeler: [
          { ad: "Doğrulama & Geçerleme (V&V)", ne: "Kanonik referanslara karşı kontrol tablosu; her satır bir kanonik testi sertifikalar." },
        ],
        butonlar: [
          { ad: "çekmeceyi aç", ne: "V&V kontrol tablosunu açar." },
        ],
      },
      en: {
        faz: "SYSTEM · VALIDATION", baslik: "Engine accuracy",
        anlatim: "Trust the results: Verification & Validation (V&V) certifies the engine against canonical analytical references — engineering-disciplined, not 'AI-made'.",
        amac: "Documents engine accuracy by comparing simulation results to canonical analytical references (UIC 406, Sperrzeit).",
        girdi: "Engine outputs and the matching canonical closed-form references.",
        cikti: "For each check: expected / found / deviation value and pass-fail status.",
        bolmeler: [
          { ad: "Verification & Validation (V&V)", ne: "Control table against canonical references; each row certifies one canonical test." },
        ],
        butonlar: [
          { ad: "open drawer", ne: "Opens the V&V control table." },
        ],
      },
      de: {
        faz: "SYSTEM · VALIDIERUNG", baslik: "Modellgenauigkeit",
        anlatim: "Vertrauen in die Ergebnisse: Verifizierung & Validierung (V&V) zertifiziert das Modell gegen kanonische analytische Referenzen — ingenieurmäßig, nicht 'KI-gemacht'.",
        amac: "Dokumentiert die Modellgenauigkeit durch Vergleich der Simulationsergebnisse mit kanonischen Referenzen (UIC 406, Sperrzeit).",
        girdi: "Modellausgaben und die passenden kanonischen geschlossenen Referenzen.",
        cikti: "Je Prüfung: erwarteter / gefundener / Abweichungswert und Bestanden-Status.",
        bolmeler: [
          { ad: "Verifizierung & Validierung (V&V)", ne: "Kontrolltabelle gegen kanonische Referenzen; jede Zeile zertifiziert einen kanonischen Test." },
        ],
        butonlar: [
          { ad: "Schublade öffnen", ne: "Öffnet die V&V-Kontrolltabelle." },
        ],
      },
    },
  },

  // ——— BELGELE ———
  {
    no: "11", anahtar: "belgele", slug: "belgeler", baglanti: ["kur", "karsilastir", "dogrulama"],
    metin: {
      tr: {
        faz: "BELGELE", baslik: "Profesyonel rapor",
        anlatim: "Tüm analizden markalı, baskıya hazır PDF dokümantasyon üretilir — her sayı girdi ve yöntem künyeli, izlenebilir.",
        amac: "Tüm analizi markalı PDF dokümantasyona çevirir ve hattı railML/GTFS olarak dışa aktarır.",
        girdi: "Proje hattı + parametreler + künye (proje/hat adı, doküman no, revizyon, idare, yüklenici…), logo, rapor dili ve seçili bölümler.",
        cikti: "Her sayı girdi+yöntem künyeli izlenebilir PDF; isteğe bağlı müşteri-sunumu varyantı; railML (.xml) / GTFS (.zip) dosyaları.",
        bolmeler: [
          { ad: "Proje Künyesi", ne: "Kapak bilgileri (proje/hat adı, doküman no, idare, yüklenici…) + logo." },
          { ad: "PDF Rapor", ne: "Rapor dili, QR derin-bağlantı, bölüm seçici + kredi, içerik özeti ve müşteri-sunumu seçeneği." },
          { ad: "Dışa Aktar", ne: "railML (.xml) ve GTFS (.zip) ücretsiz indir — OpenTrack/RailSys ya da harita/transit uygulamaları için." },
        ],
        butonlar: [
          { ad: "📷 Logo yükle · Kaldır", ne: "Kapak logosunu ekler/çıkarır (PNG/JPG/SVG)." },
          { ad: "Türkçe · English", ne: "Rapor dilini seçer (ekran daima gerçek; Almanca rapor henüz yok)." },
          { ad: "QR derin-bağlantı", ne: "Kapağa bu hattın canlı simülasyon QR'ını koyar (paylaşım açık olmalı)." },
          { ad: "Rapor Bölümleri · tümü · yalnız taban", ne: "Rapora girecek bölümleri seçer (kümülatif kredi)." },
          { ad: "PDF'i müşteri sunumu olarak üret", ne: "Raporu onaylı tasarım dilinde üretir (yalnız PDF; ekran değişmez)." },
          { ad: "🖨 PDF Rapor · kredi", ne: "Markalı, baskıya hazır raporu üretir (kredi düşer)." },
          { ad: "⬆ railML · ⬆ GTFS", ne: "Hattı railML (altyapı+araç+çift-yön tarife) ya da GTFS olarak dışa aktarır." },
        ],
      },
      en: {
        faz: "DOCUMENT", baslik: "Professional report",
        anlatim: "From the whole analysis a branded, print-ready PDF document is produced — every number carries its input and method, fully traceable.",
        amac: "Turns the whole analysis into branded PDF documentation and exports the line as railML/GTFS.",
        girdi: "Project line + parameters + details (project/line name, doc no, revision, authority, contractor…), logo, report language and selected sections.",
        cikti: "A traceable PDF where every number carries its input+method; an optional client-presentation variant; railML (.xml) / GTFS (.zip) files.",
        bolmeler: [
          { ad: "Project Details", ne: "Cover details (project/line name, doc no, authority, contractor…) + logo." },
          { ad: "PDF Report", ne: "Report language, QR deep-link, section selector + credits, content summary and client-presentation option." },
          { ad: "Export", ne: "Free railML (.xml) and GTFS (.zip) download — for OpenTrack/RailSys or map/transit apps." },
        ],
        butonlar: [
          { ad: "📷 Upload logo · Remove", ne: "Adds/removes the cover logo (PNG/JPG/SVG)." },
          { ad: "Türkçe · English", ne: "Picks the report language (screen always real; DE report not yet available)." },
          { ad: "QR deep-link", ne: "Puts this line's live-sim QR on the cover (sharing must be on)." },
          { ad: "Report Sections · all · base only", ne: "Selects the sections to include (cumulative credits)." },
          { ad: "Produce PDF as client presentation", ne: "Renders the report in approved-design language (PDF only; screen unchanged)." },
          { ad: "🖨 PDF Report · credits", ne: "Produces the branded, print-ready report (credits deducted)." },
          { ad: "⬆ railML · ⬆ GTFS", ne: "Exports the line as railML (infrastructure+stock+two-way timetable) or GTFS." },
        ],
      },
      de: {
        faz: "DOKUMENTIEREN", baslik: "Professioneller Bericht",
        anlatim: "Aus der gesamten Analyse entsteht ein markiertes, druckfertiges PDF-Dokument — jede Zahl trägt ihre Eingabe und Methode, voll nachvollziehbar.",
        amac: "Macht aus der gesamten Analyse eine markierte PDF-Dokumentation und exportiert die Strecke als railML/GTFS.",
        girdi: "Projektstrecke + Parameter + Angaben (Projekt-/Linienname, Dok.-Nr., Revision, Behörde, Auftragnehmer…), Logo, Berichtssprache und gewählte Abschnitte.",
        cikti: "Ein nachvollziehbares PDF, in dem jede Zahl Eingabe+Methode trägt; eine optionale Kundenpräsentationsvariante; railML (.xml) / GTFS (.zip).",
        bolmeler: [
          { ad: "Projektangaben", ne: "Deckblattangaben (Projekt-/Linienname, Dok.-Nr., Behörde, Auftragnehmer…) + Logo." },
          { ad: "PDF-Bericht", ne: "Berichtssprache, QR-Deeplink, Abschnittswahl + Credits, Inhaltsübersicht und Kundenpräsentationsoption." },
          { ad: "Export", ne: "Kostenloser railML (.xml)- und GTFS (.zip)-Download — für OpenTrack/RailSys oder Karten-/Transit-Apps." },
        ],
        butonlar: [
          { ad: "📷 Logo hochladen · Entfernen", ne: "Fügt das Deckblatt-Logo hinzu/entfernt es (PNG/JPG/SVG)." },
          { ad: "Türkçe · English", ne: "Wählt die Berichtssprache (Bildschirm immer real; DE-Bericht noch nicht verfügbar)." },
          { ad: "QR-Deeplink", ne: "Setzt den Live-Sim-QR dieser Strecke aufs Deckblatt (Teilen muss aktiv sein)." },
          { ad: "Berichtsabschnitte · alle · nur Basis", ne: "Wählt die enthaltenen Abschnitte (kumulative Credits)." },
          { ad: "PDF als Kundenpräsentation erzeugen", ne: "Rendert den Bericht in freigegebener Planungssprache (nur PDF; Bildschirm unverändert)." },
          { ad: "🖨 PDF-Bericht · Credits", ne: "Erzeugt den markierten, druckfertigen Bericht (Credits abgezogen)." },
          { ad: "⬆ railML · ⬆ GTFS", ne: "Exportiert die Strecke als railML (Infrastruktur+Fahrzeug+Zwei-Richtungs-Fahrplan) oder GTFS." },
        ],
      },
    },
  },

  // ——— KARŞILAŞTIR ———
  {
    no: "12", anahtar: "karsilastir", slug: "karsilastirma", baglanti: ["belgele", "kur"],
    metin: {
      tr: {
        faz: "KARŞILAŞTIR", baslik: "Senaryo karşılaştırma",
        anlatim: "Farklı senaryoları veya projeleri yan yana koy — objektif, sayıya dayalı karar desteği.",
        amac: "Projeleri ya da aktif hatta parametre varyantlarını yan yana koyup objektif, sayıya dayalı kararı gösterir.",
        girdi: "2–4 kayıtlı proje VEYA aktif hatta tek parametrenin (doluluk tavanı / sefer aralığı) 2–4 değeri.",
        cikti: "Karar tablosu (satır başına en iyi hücre altın), çubuk kıyaslar (Δ), objektif öneri özeti ve PDF karşılaştırma raporu.",
        bolmeler: [
          { ad: "Mod seçici", ne: "Projeler ↔ What-if (tek hat) arasında geçiş." },
          { ad: "Projeleri Seç / What-if", ne: "Kolonları belirler: 2–4 proje ya da bir parametrenin 2–4 değeri." },
          { ad: "Objektif Öneri Özeti", ne: "En yüksek sürdürülebilir kapasite, en az filo, en kısa çevrim, en yüksek işletme kapasitesi — her birinde kazananı adlandırır." },
          { ad: "Karar tablosu + Çubuk kıyaslar", ne: "Göstergeler kolon kolon (altın hücre = en iyi) + teorik maks / işletme kapasitesi / gereken filo çubukları." },
        ],
        butonlar: [
          { ad: "Projeler · What-if", ne: "Karşılaştırma modunu seçer." },
          { ad: "proje seç (2–4) · parametre + değer ekle", ne: "Karşılaştırma kolonlarını kurar." },
          { ad: "🖨 PDF Karşılaştırma Raporu", ne: "Baskıya hazır karar raporunu üretir (kredi düşer)." },
        ],
      },
      en: {
        faz: "COMPARE", baslik: "Scenario comparison",
        anlatim: "Put different scenarios or projects side by side — objective, number-based decision support.",
        amac: "Puts projects, or parameter variants of the active line, side by side and shows the objective, number-based decision.",
        girdi: "2–4 saved projects OR 2–4 values of one parameter (occupancy ceiling / headway) on the active line.",
        cikti: "Decision table (best cell per row in gold), bar comparisons (Δ), objective recommendation summary and a PDF comparison report.",
        bolmeler: [
          { ad: "Mode selector", ne: "Switches between Projects ↔ What-if (single line)." },
          { ad: "Pick Projects / What-if", ne: "Sets the columns: 2–4 projects or 2–4 values of one parameter." },
          { ad: "Objective Recommendation Summary", ne: "Highest sustainable capacity, lowest fleet, shortest cycle, highest operating capacity — names the winner of each." },
          { ad: "Decision table + Bar comparisons", ne: "Indicators column by column (gold cell = best) + theoretical max / operating capacity / required fleet bars." },
        ],
        butonlar: [
          { ad: "Projects · What-if", ne: "Selects the comparison mode." },
          { ad: "pick projects (2–4) · add parameter + value", ne: "Sets up the comparison columns." },
          { ad: "🖨 PDF Comparison Report", ne: "Produces the print-ready decision report (credits deducted)." },
        ],
      },
      de: {
        faz: "VERGLEICHEN", baslik: "Szenarienvergleich",
        anlatim: "Stellen Sie verschiedene Szenarien oder Projekte nebeneinander — objektive, zahlenbasierte Entscheidungshilfe.",
        amac: "Stellt Projekte oder Parametervarianten der aktiven Strecke nebeneinander und zeigt die objektive, zahlenbasierte Entscheidung.",
        girdi: "2–4 gespeicherte Projekte ODER 2–4 Werte eines Parameters (Auslastungsgrenze / Zugfolgezeit) der aktiven Strecke.",
        cikti: "Entscheidungstabelle (beste Zelle je Zeile in Gold), Balkenvergleiche (Δ), objektive Empfehlungsübersicht und ein PDF-Vergleichsbericht.",
        bolmeler: [
          { ad: "Modusauswahl", ne: "Wechselt zwischen Projekte ↔ What-if (Einzelstrecke)." },
          { ad: "Projekte wählen / What-if", ne: "Legt die Spalten fest: 2–4 Projekte oder 2–4 Werte eines Parameters." },
          { ad: "Objektive Empfehlungsübersicht", ne: "Höchste nachhaltige Kapazität, geringste Flotte, kürzester Umlauf, höchste betriebliche Kapazität — benennt jeweils den Sieger." },
          { ad: "Entscheidungstabelle + Balkenvergleiche", ne: "Indikatoren spaltenweise (goldene Zelle = beste) + Balken für theoret. Max / betriebl. Kapazität / nötige Flotte." },
        ],
        butonlar: [
          { ad: "Projekte · What-if", ne: "Wählt den Vergleichsmodus." },
          { ad: "Projekte wählen (2–4) · Parameter + Wert", ne: "Richtet die Vergleichsspalten ein." },
          { ad: "🖨 PDF-Vergleichsbericht", ne: "Erzeugt den druckfertigen Entscheidungsbericht (Credits abgezogen)." },
        ],
      },
    },
  },

  // ——— KAPANIŞ KAPAĞI ———
  {
    no: "13", anahtar: "kapanis", slug: "ringler", kapak: true,
    metin: {
      tr: { faz: "KAPANIŞ", baslik: "Kur → Analiz → Karar", anlatim: "İşte bütün akış: gerçek veriyle kur, mikroskobik fizikle simüle et, kanonik yöntemle doğrula ve raporla. Şimdi kendi hattınla dene." },
      en: { faz: "WRAP-UP", baslik: "Build → Analyze → Decide", anlatim: "That's the whole flow: build from real data, simulate with microscopic physics, validate with canonical methods and report. Now try it with your own line." },
      de: { faz: "ABSCHLUSS", baslik: "Aufbauen → Analysieren → Entscheiden", anlatim: "Das ist der gesamte Ablauf: aus echten Daten aufbauen, mit mikroskopischer Physik simulieren, mit kanonischen Methoden validieren und dokumentieren. Jetzt mit Ihrer eigenen Strecke ausprobieren." },
    },
  },
];

const TOPLAM = ADIMLAR.length;
// Bağlantı rozetleri için: anahtar → adım indeksi.
const ADIM_INDEX: Record<string, number> = Object.fromEntries(ADIMLAR.map((a, k) => [a.anahtar, k]));

function vurguTemizle() {
  document.querySelectorAll(".sunum-vurgu").forEach((el) => el.classList.remove("sunum-vurgu"));
}

function hedefEleman(a: Adim): HTMLElement | null {
  if (a.sekme) {
    const [pre] = a.sekme.split("-");
    const n = a.sekme.slice(-1);
    const panel = document.querySelector<HTMLElement>(`.${pre}-panel[data-t="${n}"]`);
    if (panel) return panel;
  }
  return document.getElementById(a.hedefId ?? a.slug);
}

// Dil seçici (TR · EN · DE) — üst düzey (render içinde tanımlanmaz).
function DilSecici({ dil, setDil, koyu }: { dil: Dil; setDil: (d: Dil) => void; koyu?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-full p-0.5" style={{ background: koyu ? "#0A1826" : "#12314A" }}>
      {DILLER.map((d) => (
        <button key={d} type="button" onClick={() => setDil(d)}
          className="rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide transition"
          style={dil === d ? { background: brand.gold, color: "#0C2233" } : { color: "#93A6B6" }}>{d}</button>
      ))}
    </div>
  );
}

// İlerleme noktaları — üst düzey; adıma atlar.
function Noktalar({ i, git, dil, gizliMobil }: { i: number; git: (n: number) => void; dil: Dil; gizliMobil?: boolean }) {
  return (
    <div className={`${gizliMobil ? "hidden md:flex" : "flex"} flex-wrap items-center justify-center gap-1.5`}>
      {ADIMLAR.map((s, k) => (
        <button key={s.no} type="button" onClick={() => git(k)} aria-label={`${k + 1}: ${s.metin[dil].baslik}`} title={`${s.no}. ${s.metin[dil].baslik}`}
          className="h-2 rounded-full transition-all"
          style={{ width: k === i ? 18 : 8, background: k === i ? brand.gold : k < i ? "#6C5A2E" : "#31536B" }} />
      ))}
    </div>
  );
}

// Küçük etiket + içerik bloğu (Amaç / Girdi / Çıktı).
function Alan({ etiket, deger }: { etiket: string; deger?: string }) {
  if (!deger) return null;
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "#0C2233", border: "1px solid #1C3B54" }}>
      <div className="font-brand text-[0.6875rem] font-bold tracking-[0.14em]" style={{ color: "#E7D9B0" }}>{etiket}</div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: "#D6E2EC" }}>{deger}</div>
    </div>
  );
}

// Öğe listesi (paneller/grafikler ya da butonlar): ad — açıklama.
function OgeListe({ baslik, ogeler, isaret }: { baslik: string; ogeler?: Oge[]; isaret: string }) {
  if (!ogeler || ogeler.length === 0) return null;
  return (
    <div>
      <div className="font-brand text-[0.6875rem] font-bold tracking-[0.14em]" style={{ color: "#E7D9B0" }}>{baslik}</div>
      <ul className="mt-1.5 space-y-1">
        {ogeler.map((o, k) => (
          <li key={k} className="flex gap-2 text-xs leading-relaxed" style={{ color: "#C4D2DE" }}>
            <span aria-hidden="true" style={{ color: brand.gold }}>{isaret}</span>
            <span><b className="font-semibold text-white">{o.ad}</b> — {o.ne}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SunumModu() {
  const [aktif, setAktif] = useState(false);
  const [i, setI] = useState(0);
  const [oto, setOto] = useState(false);
  const [genis, setGenis] = useState(true);   // rehber kartı açık/kapalı
  // Dil UYGULAMA GENELİ tek kaynaktan (DilProvider) — sunum + arayüz aynı dili kullanır.
  const { dil, setDil } = useDil();

  const git = (n: number) => setI(Math.max(0, Math.min(TOPLAM - 1, n)));
  const kapat = () => { setOto(false); setAktif(false); };

  // Oto-oynat: her adımda ~11 s sonra ilerle (rehber kartı daha uzun); son adımda oto kapanır.
  useEffect(() => {
    if (!aktif || !oto) return;
    const son = i >= TOPLAM - 1;
    const id = setTimeout(() => { if (son) setOto(false); else setI(i + 1); }, son ? 3500 : 11000);
    return () => clearTimeout(id);
  }, [aktif, oto, i]);

  // Adım değişince: kapak değilse sekmeyi aç + butonları tıkla + kaydır + vurgula.
  useEffect(() => {
    if (!aktif) { vurguTemizle(); return; }
    const a = ADIMLAR[i];
    if (a.kapak) { vurguTemizle(); return; }
    if (a.sekme) document.getElementById(a.sekme)?.click();
    for (const key of a.tikla ?? []) {
      document.querySelector<HTMLButtonElement>(`[data-sunum="${key}"]`)?.click();
    }
    const t = setTimeout(() => {
      vurguTemizle();
      document.getElementById(a.hedefId ?? a.slug)?.scrollIntoView({ behavior: "smooth", block: a.hedefId ? "center" : "start" });
      hedefEleman(a)?.classList.add("sunum-vurgu");
    }, (a.sekme || a.tikla?.length) ? 320 : 60);
    return () => clearTimeout(t);
  }, [aktif, i]);

  useEffect(() => () => vurguTemizle(), []);

  // Klavye: ← → gezinir, Esc çıkar.
  useEffect(() => {
    if (!aktif) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); git(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); git(i - 1); }
      else if (e.key === "Escape") kapat();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [aktif, i]);

  if (!aktif) {
    return (
      <button
        type="button"
        data-noprint
        onClick={() => { setI(0); setOto(false); setGenis(true); setAktif(true); }}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
        style={{ background: "#0C2233", borderColor: "#A8842C", color: "#fff" }}
        title={UI[dil].acTitle}
      >
        <span aria-hidden="true">▷</span> {UI[dil].ac}
      </button>
    );
  }

  const a = ADIMLAR[i];
  const m = a.metin[dil];
  const t = UI[dil];

  // ——— KAPAK KARTI (giriş / kapanış) ———
  if (a.kapak) {
    return (
      <div className="sunum-kapak fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center" data-noprint
        style={{ background: "radial-gradient(130% 130% at 50% 0%, #123048 0%, #0A1826 55%, #060D16 100%)" }}>
        <button type="button" onClick={kapat} aria-label={t.cik}
          className="absolute right-5 top-5 rounded-md px-2.5 py-1.5 text-sm" style={{ color: "#8494A3" }}>✕</button>
        <div className="absolute left-1/2 top-6 -translate-x-1/2"><DilSecici dil={dil} setDil={setDil} koyu /></div>

        <div className="sunum-kapak-ic flex flex-col items-center">
        {/* RaySim amblemi — iki rayın ufka doğru birleşmesi (mühür) */}
        <svg width="72" height="72" viewBox="0 0 46 46" fill="none" aria-hidden="true" className="mb-5">
          <circle cx="23" cy="23" r="21.5" stroke="#A8842C" strokeWidth="1" />
          <circle cx="23" cy="23" r="18" stroke="#E7ECF1" strokeWidth="1" opacity="0.45" />
          <path d="M17 34 L21.5 13 M29 34 L24.5 13" stroke="#E7ECF1" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M18.4 28 L27.6 28 M19.3 24 L26.7 24 M20 20.5 L26 20.5 M20.7 17.5 L25.3 17.5" stroke="#C8102E" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div className="font-brand text-xs font-bold tracking-[0.32em]" style={{ color: "#E7D9B0" }}>{m.faz}</div>
        <h1 className="font-brand mt-3 text-5xl font-semibold tracking-tight text-white sm:text-6xl">{m.baslik}</h1>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed sm:text-base" style={{ color: "#C4D2DE" }}>{m.anlatim}</p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {i === 0 ? (
            <button type="button" onClick={() => git(1)}
              className="rounded-lg px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105" style={{ background: brand.red }}>
              {t.basla} ▷
            </button>
          ) : (
            <>
              <button type="button" onClick={() => git(0)}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold" style={{ border: "1px solid #31536B", color: "#fff" }}>↻ {t.bastan}</button>
              <button type="button" onClick={kapat}
                className="rounded-lg px-6 py-2.5 text-sm font-bold shadow-lg transition-transform hover:scale-105" style={{ background: brand.gold, color: "#0C2233" }}>{t.bitir} ✓</button>
            </>
          )}
          {i > 0 && (
            <button type="button" onClick={() => git(i - 1)}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold" style={{ border: "1px solid #31536B", color: "#fff" }}>◁ {t.geri}</button>
          )}
        </div>
        </div>

        <div className="absolute bottom-8"><Noktalar i={i} git={git} dil={dil} /></div>
      </div>
    );
  }

  // Bağlantı rozetleri (bu adımdan ilişkili bölümlere atlar).
  const baglantilar = (a.baglanti ?? [])
    .map((anh) => ({ anh, k: ADIM_INDEX[anh] }))
    .filter((x) => typeof x.k === "number" && x.k !== i);

  // ——— ANLATIM ŞERİDİ + REHBER KARTI (orta adımlar) ———
  return (
    <div className="sunum-serit fixed inset-x-0 bottom-0 z-50 border-t-2 shadow-2xl" data-noprint
      style={{ background: "linear-gradient(180deg,#0F2B40 0%,#0C2233 100%)", borderColor: brand.gold }}>
      {/* Genel ilerleme çizgisi */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "#12314A" }}>
        <div className="h-full transition-[width] duration-300 ease-out"
          style={{ width: `${((i + 1) / TOPLAM) * 100}%`, background: `linear-gradient(90deg, ${brand.gold}, ${brand.red})` }} />
      </div>

      <div className="mx-auto max-w-5xl px-5 py-3.5">
        {/* ÜST SATIR: faz rozeti + başlık + diller + kontroller */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold tabular-nums"
              style={{ background: brand.red, color: "#fff", boxShadow: `0 0 0 4px ${brand.red}33` }}>{a.no}</span>
            <div className="min-w-0">
              <div className="font-brand text-xs font-bold tracking-[0.2em]" style={{ color: "#E7D9B0" }}>
                {m.faz}<span className="ml-1 font-mono tracking-normal" style={{ color: "#7E93A6" }}>· {i + 1}/{TOPLAM}</span>
              </div>
              <div className="text-sm font-semibold text-white">{m.baslik}</div>
            </div>
          </div>

          {/* özet anlatım (üst satırda, kısa) */}
          <p className="min-w-0 flex-1 text-xs leading-relaxed sm:px-3" style={{ color: "#C4D2DE" }}>{m.anlatim}</p>

          {/* Dil + noktalar */}
          <div className="flex items-center gap-2">
            <DilSecici dil={dil} setDil={setDil} />
            <Noktalar i={i} git={git} dil={dil} gizliMobil />
          </div>

          {/* Kontroller */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setGenis((g) => !g)} aria-label={genis ? t.kapat2 : t.ac2} title={genis ? t.kapat2 : t.ac2}
              className="rounded-md px-2.5 py-1.5 text-xs font-bold" style={{ background: "#12314A", color: "#fff" }}>
              {genis ? "▾" : "▸"}
            </button>
            <button type="button" onClick={() => setOto((o) => !o)} aria-label={oto ? t.duraklat : t.oynat} title={oto ? t.duraklat : t.oynat}
              className="rounded-md px-2.5 py-1.5 text-xs font-bold" style={{ background: oto ? brand.gold : "#12314A", color: oto ? "#0C2233" : "#fff" }}>
              {oto ? "⏸" : "⏵"}
            </button>
            <button type="button" onClick={() => git(i - 1)} disabled={i === 0}
              className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              style={{ border: "1px solid #31536B", color: "#fff" }}>◁ {t.geri}</button>
            <button type="button" onClick={() => git(i + 1)}
              className="rounded-md px-3 py-1.5 text-xs font-bold text-white" style={{ background: brand.red }}>{t.ileri} ▷</button>
            <button type="button" onClick={kapat} aria-label={t.cik}
              className="rounded-md px-2 py-1.5 text-xs" style={{ color: "#8494A3" }}>✕</button>
          </div>
        </div>

        {/* REHBER KARTI: Amaç · Girdi · Çıktı · paneller/grafikler · butonlar · bağlantılar */}
        {genis && (
          <div className="mt-3 max-h-[42vh] space-y-3 overflow-y-auto border-t pt-3" style={{ borderColor: "#1C3B54" }}>
            {(m.amac || m.girdi || m.cikti) && (
              <div className="grid gap-2 sm:grid-cols-3">
                <Alan etiket={t.amac} deger={m.amac} />
                <Alan etiket={t.girdi} deger={m.girdi} />
                <Alan etiket={t.cikti} deger={m.cikti} />
              </div>
            )}

            <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
              <OgeListe baslik={t.bolmeler} ogeler={m.bolmeler} isaret="◆" />
              <OgeListe baslik={t.butonlar} ogeler={m.butonlar} isaret="⟩" />
            </div>

            {baglantilar.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "#1C3B54" }}>
                <span className="font-brand text-[0.6875rem] font-bold tracking-[0.14em]" style={{ color: "#E7D9B0" }}>{t.baglanti}:</span>
                {baglantilar.map(({ anh, k }) => (
                  <button key={anh} type="button" onClick={() => git(k)}
                    className="rounded-full px-3 py-1 text-xs font-semibold transition hover:scale-105"
                    style={{ background: "#12314A", border: "1px solid #31536B", color: "#D6E2EC" }}>
                    {ADIMLAR[k].metin[dil].baslik} ↗
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
