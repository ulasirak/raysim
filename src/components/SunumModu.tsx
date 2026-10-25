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
    bolmeler: "Bu bölümdeki paneller ve grafikler", butonlar: "Tıklanabilir kontroller",
    baglanti: "Bağlantılı bölümler", ac2: "Rehberi aç", kapat2: "Rehberi küçült",
  },
  en: {
    basla: "Start", ileri: "Next", geri: "Back", bitir: "Finish", bastan: "Restart",
    oynat: "Auto-play", duraklat: "Pause", cik: "Exit",
    ac: "Presentation Mode", acTitle: "A comprehensive guided tour that walks through every section's purpose, input, output, charts and buttons one by one (TR · EN · DE)",
    amac: "Purpose", girdi: "Input", cikti: "Output",
    bolmeler: "Panels and charts here", butonlar: "Clickable controls",
    baglanti: "Linked sections", ac2: "Open guide", kapat2: "Minimize guide",
  },
  de: {
    basla: "Starten", ileri: "Weiter", geri: "Zurück", bitir: "Beenden", bastan: "Neustart",
    oynat: "Autoplay", duraklat: "Pause", cik: "Schließen",
    ac: "Präsentationsmodus", acTitle: "Eine umfassende geführte Tour durch Zweck, Eingabe, Ausgabe, Diagramme und Schaltflächen jedes Bereichs (TR · EN · DE)",
    amac: "Zweck", girdi: "Eingabe", cikti: "Ausgabe",
    bolmeler: "Bereiche und Diagramme hier", butonlar: "Anklickbare Steuerungen",
    baglanti: "Verknüpfte Bereiche", ac2: "Leitfaden öffnen", kapat2: "Leitfaden verkleinern",
  },
};

const ADIMLAR: Adim[] = [
  // ——— GİRİŞ KAPAĞI ———
  {
    no: "1", anahtar: "giris", slug: "ringler", kapak: true,
    metin: {
      tr: { faz: "Genel bakış", baslik: "RaySim", anlatim: "RaySim, bir raylı sistem hattını gerçek veriyle kuran, dakikliğini ve kapasitesini mikroskobik bir fizik motoruyla simüle eden ve sonucu UIC 406 metodolojisiyle raporlayan bütünleşik bir karar-destek platformudur. Bu rehber sizi hattın tanımından nihai karara kadar bölüm bölüm gezdirir; her ekranın ne işe yaradığını, neyi girdi aldığını, çıktısını neye dayandırdığını ve her butonun ne yaptığını tek tek anlatır. İzleyeceğimiz yol şu: önce hattı kurarız, sonra işletmeyi analiz ederiz, sistemin fiziksel sınırlarını çıkarırız, belgeleriz ve farklı senaryoları karşılaştırırız." },
      en: { faz: "Overview", baslik: "RaySim", anlatim: "RaySim is an integrated decision-support platform that builds a rail line from real-world data, simulates its punctuality and capacity with a microscopic physics engine, and reports the result using the UIC 406 methodology. This guide takes you through the system section by section, from defining the line to the final decision, explaining what each screen is for, what it reads as input, what its output rests on, and what every button does. Here is the path we'll follow: first we build the line, then we analyze the operation, work out the system's physical limits, document everything, and compare scenarios." },
      de: { faz: "Überblick", baslik: "RaySim", anlatim: "RaySim ist eine integrierte Entscheidungsplattform, die eine Bahnstrecke aus realen Daten aufbaut, ihre Pünktlichkeit und Kapazität mit einem mikroskopischen Physikmodell simuliert und das Ergebnis nach der UIC-406-Methodik dokumentiert. Dieser Leitfaden führt Sie Abschnitt für Abschnitt durch das System, von der Definition der Strecke bis zur endgültigen Entscheidung, und erklärt, wozu jeder Bildschirm dient, was er als Eingabe liest, worauf seine Ausgabe beruht und was jede Schaltfläche tut. Der Weg sieht so aus: zuerst bauen wir die Strecke auf, dann analysieren wir den Betrieb, ermitteln die physikalischen Grenzen des Systems, dokumentieren alles und vergleichen verschiedene Szenarien." },
    },
  },

  // ——— KUR ———
  {
    no: "2", anahtar: "kur", slug: "ringler", baglanti: ["filo", "kapasite", "belgele"],
    metin: {
      tr: {
        faz: "Kur", baslik: "Hattı tanımla",
        anlatim: "Her analiz hattın kendisiyle başlar. Durakları, aralarındaki hücreleri, makasları, geçitleri, kurpları ve sinyalleri burada tanımlarsınız. Girdiğiniz her değer projeye kalıcı olarak kaydedilir ve bundan sonraki bütün hesapların dayandığı tek gerçek halini alır.",
        amac: "Simülasyonun tamamının üzerine kurulduğu hattı oluşturmanızı sağlar. Durakları ve durak aralarını, makas bölgelerini, hemzemin ve yaya geçitlerini, yatay kurpları, sinyal bloklarını, depoları, terminalleri ve varsa şubeleri burada tanımlarsınız.",
        girdi: "Veriyi elle girebilir ya da hazır bir kaynaktan içe aktarabilirsiniz: GTFS, railML, CAD (DXF), Shapefile veya OpenStreetMap. Mesafe ve saha hızı, makasın S/X geometrisi, geçitlerdeki sinyal önceliği, kurp yarıçapı gibi her ayrıntı hattın bir parçası olur.",
        cikti: "Bütün modüllerin okuduğu kalıcı proje hattı. Ayrıca hattın taşıyabileceği en fazla tramvay sayısını ve bunu hangi etkenin sınırladığını (darboğaz) burada görürsünüz.",
        bolmeler: [
          { ad: "Dosyadan İçe Aktar", ne: "GTFS, railML, CAD (DXF), Shapefile ya da OpenStreetMap verisinden hattı otomatik kurar. Makas ve sinyaller sonradan elle eklenir." },
          { ad: "Duraklar & Mesafeler", ne: "Durak zincirini, aralarındaki mesafeleri, her durağın bekleme süresini (otomatik ya da elle) ve hangi durakların depo olduğunu belirlersiniz." },
          { ad: "Ring kartları", ne: "Her durak-arası hücreyi tek tek düzenlersiniz; makas, yaya ya da karayolu geçidi, acil fren bölgesi, kurp ve sinyal ekleyebilirsiniz." },
          { ad: "Şube / Tali Hat", ne: "Bir kavşak durağından ayrılan tali hattı tanımlar; ortak kesimin yükünü ve kavşaktaki çakışmayı hesaba katar." },
          { ad: "Maksimum Tramvay Kapasitesi", ne: "Terminal dönüş tipinden, peron sayısından ve platform işgal sürelerinden hattaki en fazla tramvayı bulur ve sınırlayan etkeni adıyla söyler." },
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
        faz: "Build", baslik: "Define the line",
        anlatim: "Every analysis begins with the line itself. Here you define the stops, the cells between them, the switches, crossings, curves and signals. Every value you enter is saved permanently to the project and becomes the single source of truth that all later calculations rely on.",
        amac: "Lets you build the line that the whole simulation rests on. You define the stops and the sections between them, switch zones, level and pedestrian crossings, horizontal curves, signal blocks, depots, terminals and, where present, branches.",
        girdi: "You can enter the data by hand or import it from a ready source: GTFS, railML, CAD (DXF), Shapefile or OpenStreetMap. Every detail becomes part of the line: distance and field speed, the switch S/X geometry, signal priority at crossings, curve radius.",
        cikti: "The permanent project line that every module reads. You also see here the most trams the line can carry and which factor limits it (the bottleneck).",
        bolmeler: [
          { ad: "Import from file", ne: "Builds the line automatically from GTFS, railML, CAD (DXF), Shapefile or OpenStreetMap. Switches and signals are added by hand afterwards." },
          { ad: "Stops & distances", ne: "You set the stop chain, the distances between stops, each stop's dwell time (automatic or manual) and which stops are depots." },
          { ad: "Ring cards", ne: "You edit each inter-stop cell individually; you can add a switch, a pedestrian or road crossing, an emergency-brake zone, a curve and a signal." },
          { ad: "Branch / spur line", ne: "Defines a spur leaving a junction stop, and accounts for the load on the shared section and the conflict at the junction." },
          { ad: "Maximum Tram Capacity", ne: "Works out the most trams the line can hold from the terminal turnback type, platform count and platform-occupancy times, and names the limiting factor." },
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
        faz: "Aufbau", baslik: "Strecke definieren",
        anlatim: "Jede Analyse beginnt mit der Strecke selbst. Hier definieren Sie die Haltestellen, die Abschnitte dazwischen, die Weichen, Übergänge, Bögen und Signale. Jeder eingegebene Wert wird dauerhaft im Projekt gespeichert und wird zur einzigen Grundlage, auf die sich alle späteren Berechnungen stützen.",
        amac: "Hier bauen Sie die Strecke auf, auf der die gesamte Simulation beruht. Sie definieren die Haltestellen und die Abschnitte dazwischen, Weichenbereiche, Bahn- und Fußgängerübergänge, Gleisbögen, Signalblöcke, Depots, Endstellen und, sofern vorhanden, Äste.",
        girdi: "Sie können die Daten von Hand eingeben oder aus einer fertigen Quelle importieren: GTFS, railML, CAD (DXF), Shapefile oder OpenStreetMap. Jedes Detail wird Teil der Strecke: Entfernung und Streckengeschwindigkeit, die Weichen-S/X-Geometrie, Signalvorrang an Übergängen, Bogenradius.",
        cikti: "Die dauerhafte Projektstrecke, die jedes Modul liest. Außerdem sehen Sie hier, wie viele Fahrzeuge die Strecke höchstens aufnehmen kann und welcher Faktor sie begrenzt (der Engpass).",
        bolmeler: [
          { ad: "Aus Datei importieren", ne: "Baut die Strecke automatisch aus GTFS, railML, CAD (DXF), Shapefile oder OpenStreetMap. Weichen und Signale werden danach von Hand ergänzt." },
          { ad: "Haltestellen & Entfernungen", ne: "Sie legen die Haltestellenkette, die Abstände, die Haltezeit jeder Haltestelle (automatisch oder manuell) und die Depots fest." },
          { ad: "Abschnittskarten", ne: "Sie bearbeiten jeden Abschnitt einzeln; Sie können eine Weiche, einen Fußgänger- oder Straßenübergang, eine Notbremszone, einen Bogen und ein Signal hinzufügen." },
          { ad: "Ast / Zweigstrecke", ne: "Definiert einen Ast, der von einer Kreuzungshaltestelle abzweigt, und berücksichtigt die Last des gemeinsamen Abschnitts und den Konflikt an der Kreuzung." },
          { ad: "Maximale Straßenbahnkapazität", ne: "Ermittelt aus Wendetyp, Bahnsteigzahl und Bahnsteigbelegungszeiten die höchste Fahrzeugzahl der Strecke und benennt den begrenzenden Faktor." },
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
        faz: "Analiz", baslik: "Önerilen filoyu belirle",
        anlatim: "Sefer modülü hattı canlı bir işletmeye dönüştürür. Sistem, girdiğiniz bütün değerlere bakarak gereken tramvay sayısını önerir; öneriyi onayladığınızda filo bu sayıya ayarlanır ve ulaşılan sefer aralığı buna göre oluşur.",
        amac: "Hattı bir işletmeye dönüştürür: gereken tramvay sayısını önerir, filoyu belirler ve araçları depolara sizin elinizle park eder; rastgele dağıtım yoktur.",
        girdi: "Bir turun toplam süresi (çevrim), hedeflediğiniz sefer aralığı, yolcu talebi, çeken aracın fiziği ve durak bekleme süresi.",
        cikti: "Önerilen filo, çevrim süresinin hedef aralığa bölünmesiyle bulunur. Ulaşılan aralık ise çevrimin filoya bölümüdür. Ayrıca kapasite kontrolünü ve araçların depolara dağılımını görürsünüz.",
        bolmeler: [
          { ad: "Filo & Öneri", ne: "Önerilen filoyu, ulaşılan sefer aralığını ve kapasiteyi gösterir. 'Onayla' filoyu öneriye eşitler; araçları depolara elle yerleştirirsiniz." },
          { ad: "Çeken Araç", ne: "Araç ön-ayarı ile hız, kütle, fren, güç ve Davis direnç katsayılarını belirlersiniz. Bütün motorlar bu fiziği kullanır; tutarsız bir değer girerseniz uyarır." },
          { ad: "Yolcu Dinamiği & Duruş Süresi", ne: "Konfor, yolcu akış hızı ve kapı özelliklerinden net alanı, yolcu kapasitesini ve otomatik bekleme süresini hesaplar." },
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
        faz: "Analysis", baslik: "Set the recommended fleet",
        anlatim: "The Service module turns the line into a live operation. Looking at all the values you entered, the system recommends the number of trams you need; when you confirm, the fleet is set to that number and the achieved headway follows from it.",
        amac: "Turns the line into an operation: it recommends the number of trams you need, sets the fleet, and parks the vehicles into depots by your hand — there is no random assignment.",
        girdi: "The total time for one round trip (the cycle), the headway you're aiming for, passenger demand, the traction vehicle's physics and the stop dwell time.",
        cikti: "The recommended fleet is the cycle time divided by the target headway. The achieved headway is the cycle divided by the fleet. You also see the capacity check and how vehicles are spread across depots.",
        bolmeler: [
          { ad: "Fleet & Recommendation", ne: "Shows the recommended fleet, the achieved headway and capacity. 'Confirm' sets the fleet to the recommendation; you place vehicles into depots by hand." },
          { ad: "Traction Vehicle", ne: "You set the vehicle preset along with speed, mass, braking, power and the Davis resistance coefficients. Every engine uses this physics, and it warns you if a value is inconsistent." },
          { ad: "Passenger Dynamics & Dwell Time", ne: "Computes the net floor area, passenger capacity and automatic dwell time from comfort, passenger flow rate and door specifications." },
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
        faz: "Analyse", baslik: "Empfohlene Flotte festlegen",
        anlatim: "Das Betriebsmodul macht aus der Strecke einen laufenden Betrieb. Anhand aller eingegebenen Werte empfiehlt das System die nötige Zahl an Fahrzeugen; nach Ihrer Bestätigung wird die Flotte auf diese Zahl gesetzt, und die erreichte Zugfolgezeit ergibt sich daraus.",
        amac: "Macht aus der Strecke einen Betrieb: Es empfiehlt die nötige Fahrzeugzahl, legt die Flotte fest und stellt die Fahrzeuge von Ihrer Hand in die Depots — keine Zufallsverteilung.",
        girdi: "Die Gesamtdauer einer Runde (der Umlauf), die angestrebte Zugfolgezeit, die Fahrgastnachfrage, die Physik des Triebfahrzeugs und die Haltezeit.",
        cikti: "Die empfohlene Flotte ist die Umlaufzeit geteilt durch die Ziel-Zugfolgezeit. Die erreichte Zugfolgezeit ist der Umlauf geteilt durch die Flotte. Außerdem sehen Sie die Kapazitätsprüfung und die Verteilung der Fahrzeuge auf die Depots.",
        bolmeler: [
          { ad: "Flotte & Empfehlung", ne: "Zeigt die empfohlene Flotte, die erreichte Zugfolgezeit und die Kapazität. 'Bestätigen' setzt die Flotte auf die Empfehlung; Fahrzeuge stellen Sie von Hand in die Depots." },
          { ad: "Triebfahrzeug", ne: "Sie legen das Fahrzeug-Preset sowie Geschwindigkeit, Masse, Bremsung, Leistung und die Davis-Widerstandsbeiwerte fest. Jedes Modell nutzt diese Physik und warnt bei inkonsistenten Werten." },
          { ad: "Fahrgastdynamik & Haltezeit", ne: "Berechnet Nettofläche, Fahrgastkapazität und automatische Haltezeit aus Komfort, Fahrgastflussrate und Türspezifikationen." },
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
        faz: "Analiz", baslik: "Gerçek haritada işlet",
        anlatim: "Kurduğunuz ağı gerçek bir harita üzerinde, çift ray üzerinde gidiş ve dönüş olarak canlı izlersiniz; gidiş mavi, dönüş turuncu çizilir. Herhangi bir araca ya da işarete tıklayarak o anın ayrıntısını görürsünüz.",
        amac: "Kurulan ağı gerçek harita ya da şema üzerinde canlı çalıştırır; her aracı, içinde bulunduğu durumu ve sinyalleri gösterir.",
        girdi: "Kurulan hat, onaylı filo, depolar, ulaşılan sefer aralığı, sinyal blokları ve koordinatlar. İşleyen bir hat için koordinatlar OpenStreetMap'ten otomatik gelir.",
        cikti: "Animasyonlu tren konumları, üç renkli (kırmızı-sarı-yeşil) sinyaller ve kurp konforu. Bir trene tıkladığınızda gecikmesinin hangi etkenlerden geldiğini dökümüyle görürsünüz.",
        bolmeler: [
          { ad: "Canlı Ağ Simülasyonu", ne: "Ağı şematik bir şerit ya da coğrafi harita olarak gösterir; araç durum rozetleri, üç aspektli sinyaller ve çakışmasız çizelge burada izlenir." },
          { ad: "Ters İşletme", ne: "Makaslardan yapılan kısa dönüş ve ters yönde işletme olasılıklarını analiz eder." },
          { ad: "Tarife", ne: "Çevrim süresi ve sefer aralığından kalkış çizelgesini üretir." },
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
        faz: "Analysis", baslik: "Run on the real map",
        anlatim: "You watch the network you built live on a real map, as two tracks running out and back; the outbound run is drawn in blue and the return in orange. Click any vehicle or marker to see the detail of that moment.",
        amac: "Runs the built network live on a real map or schematic, showing every vehicle, the state it is in and the signals.",
        girdi: "The built line, the confirmed fleet, depots, the achieved headway, signal blocks and coordinates. For an operating line the coordinates come automatically from OpenStreetMap.",
        cikti: "Animated train positions, three-colour (red-amber-green) signals and curve comfort. Click a train to see a breakdown of which factors its delay comes from.",
        bolmeler: [
          { ad: "Live Network Simulation", ne: "Shows the network as a schematic strip or a geographic map; vehicle state badges, three-aspect signals and the conflict-free schedule appear here." },
          { ad: "Reverse Operation", ne: "Analyzes short-turns at switches and the option of running in the reverse direction." },
          { ad: "Timetable", ne: "Produces the departure schedule from the cycle time and the headway." },
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
        faz: "Analyse", baslik: "Auf der echten Karte fahren",
        anlatim: "Sie beobachten das aufgebaute Netz live auf einer echten Karte, als zwei Gleise im Hin- und Rücklauf; der Hinlauf wird blau, der Rücklauf orange gezeichnet. Klicken Sie ein Fahrzeug oder Symbol an, um das Detail dieses Moments zu sehen.",
        amac: "Fährt das aufgebaute Netz live auf echter Karte oder Schema und zeigt jedes Fahrzeug, seinen Zustand und die Signale.",
        girdi: "Die aufgebaute Strecke, die bestätigte Flotte, Depots, die erreichte Zugfolgezeit, Signalblöcke und Koordinaten. Bei einer Bestandsstrecke kommen die Koordinaten automatisch aus OpenStreetMap.",
        cikti: "Animierte Zugpositionen, dreifarbige Signale (rot-gelb-grün) und Bogenkomfort. Klicken Sie einen Zug an, um aufgeschlüsselt zu sehen, aus welchen Faktoren seine Verspätung stammt.",
        bolmeler: [
          { ad: "Live-Netzsimulation", ne: "Zeigt das Netz als schematischen Streifen oder geografische Karte; Fahrzeug-Zustandsabzeichen, dreibegriffige Signale und der konfliktfreie Fahrplan erscheinen hier." },
          { ad: "Kehrbetrieb", ne: "Analysiert Kehren an Weichen und die Möglichkeit, in Gegenrichtung zu fahren." },
          { ad: "Fahrplan", ne: "Erzeugt den Abfahrplan aus Umlaufzeit und Zugfolgezeit." },
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
        faz: "Analiz", baslik: "Mühendislik grafikleri",
        anlatim: "Klasik demiryolu analizinin tamamı tek bir yerde toplanır. Buradaki her grafik, canlı simülasyonla birebir aynı veriden türetilir; yani ekranda gördüğünüzle rapordaki sayı hiçbir zaman çelişmez.",
        amac: "Hattı mühendislik diliyle görünür kılar; zaman-mesafe, gecikme, hız ve yük-talep ilişkilerini canlı veriden çizer.",
        girdi: "Döngü yörüngesi, çakışmalar, durakların yük verisi, yolcu talebi ve hedeflenen doluluk.",
        cikti: "Her grafik kendi özetiyle gelir: çizelge çakışması, ikincil gecikme, hız kısıtı, en yoğun kesim ve talepten doluluğa uzanan zincir.",
        bolmeler: [
          { ad: "Bildfahrplan (Zaman–Mesafe / Marey)", ne: "Her treni bir çizgiyle gösterir: çizginin eğimi hızı, yatay bölümü durağı, çizgilerin kesişmesi iki trenin karşılaşmasını anlatır. Döngü ve çakışmalardan çizilir, altında çizelge çakışma özeti çıkar." },
          { ad: "Gecikme Yayılımı (Knock-on)", ne: "Bir trenin gecikmesinin arkadan gelenlere nasıl yayıldığını gösterir. Seçtiğiniz trene verdiğiniz birincil gecikmeden kaç trenin etkilendiğini ve toplam ikincil gecikmeyi hesaplar." },
          { ad: "Hız Profili v(x)", ne: "Aracın gerçek hızını, hız sınırı zarfının içinde çizer. Hızın nerede durak, makas ya da kurp yüzünden düştüğünü gösterir." },
          { ad: "Yük & Duruş Analizi", ne: "Yük profilini (saatlik yolcu, dolulukla renklendirilmiş) ve her durakta geçen süreyi birlikte verir. En yoğun kesimi ve zamanın nereye harcandığını gösterir." },
          { ad: "Talep → Gereken Filo → Doluluk", ne: "Yolcu talebinden yola çıkar, hedef doluluk için gereken filoyu bulur ve bu filoyla ulaşılan gerçek doluluğu gösterir." },
        ],
        butonlar: [
          { ad: "hedef tren seç · birincil gecikme", ne: "Gecikme yayılımı grafiğini sürer (hangi tren, ne kadar gecikme)." },
        ],
      },
      en: {
        faz: "Analysis", baslik: "Engineering charts",
        anlatim: "The whole of classic railway analysis is gathered in one place. Every chart here is derived from exactly the same data as the live simulation, so what you see on screen and the number in the report never disagree.",
        amac: "Makes the line visible in engineering terms, drawing the time–distance, delay, speed and load–demand relationships from live data.",
        girdi: "The loop trajectory, conflicts, the stops' load data, passenger demand and the target occupancy.",
        cikti: "Each chart comes with its own summary: schedule conflict, secondary delay, speed constraint, the busiest section and the chain from demand to occupancy.",
        bolmeler: [
          { ad: "Bildfahrplan (Time–Distance / Marey)", ne: "Shows each train as a line: the slope is speed, a horizontal stretch is a dwell, and where lines cross two trains meet. Drawn from the loop and conflicts, with a schedule-conflict summary underneath." },
          { ad: "Delay Propagation (Knock-on)", ne: "Shows how one train's delay spreads to the trains behind it. From the primary delay you give a chosen train, it works out how many trains are affected and the total secondary delay." },
          { ad: "Speed Profile v(x)", ne: "Draws the vehicle's actual speed within the speed-limit envelope, showing where the speed drops because of a stop, a switch or a curve." },
          { ad: "Load & Dwell Analysis", ne: "Gives the load profile (passengers per hour, coloured by occupancy) together with the time spent at each stop, showing the busiest section and where the time goes." },
          { ad: "Demand → Required Fleet → Occupancy", ne: "Starts from passenger demand, finds the fleet needed for the target occupancy, and shows the actual occupancy reached with that fleet." },
        ],
        butonlar: [
          { ad: "select target train · primary delay", ne: "Drives the delay-propagation chart (which train, how much delay)." },
        ],
      },
      de: {
        faz: "Analyse", baslik: "Ingenieur-Diagramme",
        anlatim: "Die gesamte klassische Eisenbahnanalyse ist an einem Ort versammelt. Jedes Diagramm hier stammt aus genau denselben Daten wie die Live-Simulation, sodass das Bild auf dem Bildschirm und die Zahl im Bericht nie widersprechen.",
        amac: "Macht die Strecke in Ingenieurbegriffen sichtbar und zeichnet die Zeit-Weg-, Verspätungs-, Geschwindigkeits- und Last-Nachfrage-Beziehungen aus Live-Daten.",
        girdi: "Die Umlauf-Trajektorie, Konflikte, die Lastdaten der Haltestellen, die Fahrgastnachfrage und die Zielauslastung.",
        cikti: "Jedes Diagramm kommt mit eigener Zusammenfassung: Fahrplankonflikt, Folgeverspätung, Geschwindigkeitsengpass, stärkster Abschnitt und die Kette von Nachfrage zu Auslastung.",
        bolmeler: [
          { ad: "Bildfahrplan (Zeit–Weg / Marey)", ne: "Zeigt jeden Zug als Linie: die Steigung ist die Geschwindigkeit, ein waagerechter Abschnitt ein Halt, und wo sich Linien kreuzen, begegnen sich zwei Züge. Aus Umlauf und Konflikten gezeichnet, mit einer Fahrplankonflikt-Zusammenfassung darunter." },
          { ad: "Verspätungsausbreitung (Folge)", ne: "Zeigt, wie sich die Verspätung eines Zuges auf die nachfolgenden ausbreitet. Aus der Primärverspätung eines gewählten Zuges ermittelt sie die Zahl der betroffenen Züge und die gesamte Folgeverspätung." },
          { ad: "Geschwindigkeitsprofil v(x)", ne: "Zeichnet die Istgeschwindigkeit des Fahrzeugs innerhalb der Grenzkurve und zeigt, wo sie wegen eines Halts, einer Weiche oder eines Bogens sinkt." },
          { ad: "Last- & Halteanalyse", ne: "Gibt das Lastprofil (Fahrgäste pro Stunde, nach Auslastung gefärbt) zusammen mit der Zeit an jeder Haltestelle und zeigt den stärksten Abschnitt und wohin die Zeit geht." },
          { ad: "Nachfrage → nötige Flotte → Auslastung", ne: "Geht von der Fahrgastnachfrage aus, findet die für die Zielauslastung nötige Flotte und zeigt die mit dieser Flotte erreichte tatsächliche Auslastung." },
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
        faz: "Analiz", baslik: "Etkiler ve dayanıklılık",
        anlatim: "Filoyu değiştirdikçe ulaşılan sıklık, kapasite ve park aşımları, tıkanan duraklar anında güncellenir. Monte-Carlo analizi ise rastgele gecikmeler altında hedef güvenilirliği ve konforu korumak için gereken en küçük filoyu söyler.",
        amac: "Seçtiğiniz filonun gerçek etkilerini ölçer ve rastgele gecikmeler karşısında ne kadar dayanıklı olduğunu sınar.",
        girdi: "Güncel filo; ortalama giriş gecikmesi ve duruş sapması; 150 seferlik bir Monte-Carlo koşusu.",
        cikti: "Ulaşılan sıklık, kapasite ve park aşımı, tıkanan duraklar; iki dakikanın altında dakiklik, ortalama, P90 ve en kötü gecikme değerleri; histogram ve kısa dönüş önerileri.",
        bolmeler: [
          { ad: "Canlı Etkiler & Öneriler", ne: "Dört temel göstergeyi (sıklık, kapasite, parklanma, tıkanma) ve kısa dönüş önerilerinin listesini gösterir." },
          { ad: "Sefer & Ters İşletme (Entegre)", ne: "Elle aralık ve zaman çubuğuyla senaryoyu oynatır; kısa dönüş kararını yaklaşan gerçek araca bağlar ve sağladığı kazancı gösterir." },
          { ad: "Monte-Carlo Gecikme Analizi", ne: "Girdiğiniz gecikme değerleriyle 150 sefer simüle eder; dakiklik istatistiğini ve dağılım histogramını çıkarır." },
        ],
        butonlar: [
          { ad: "150 sefer simüle et", ne: "Monte-Carlo dayanıklılık koşusunu başlatır." },
          { ad: "ort. giriş gecikmesi · duruş sapması", ne: "Rastgele gecikme senaryosunun girdileri." },
          { ad: "aralık · zaman çubuğu (entegre)", ne: "Ters işletme senaryosunu zaman üzerinde oynatır." },
        ],
      },
      en: {
        faz: "Analysis", baslik: "Effects and robustness",
        anlatim: "As you change the fleet, the achieved frequency, capacity and parking overflow, and the congested stops update instantly. The Monte-Carlo analysis, in turn, tells you the smallest fleet that holds your target reliability and comfort under random delays.",
        amac: "Measures the real effects of the fleet you chose and tests how robust it is against random delays.",
        girdi: "The current fleet; the average entry delay and dwell deviation; a 150-run Monte-Carlo.",
        cikti: "Achieved frequency, capacity and parking overflow, congested stops; punctuality under two minutes, average, P90 and worst-case delay; a histogram and short-turn suggestions.",
        bolmeler: [
          { ad: "Live Effects & Recommendations", ne: "Shows the four key indicators (frequency, capacity, parking, congestion) and the list of short-turn suggestions." },
          { ad: "Service & Reverse (Integrated)", ne: "Plays the scenario with a manual headway and a time bar; it binds the short-turn decision to the real approaching vehicle and shows the gain it brings." },
          { ad: "Monte-Carlo Delay Analysis", ne: "Simulates 150 runs with the delay values you enter, producing the punctuality statistics and the distribution histogram." },
        ],
        butonlar: [
          { ad: "simulate 150 runs", ne: "Starts the Monte-Carlo robustness run." },
          { ad: "avg entry delay · dwell deviation", ne: "Inputs of the random delay scenario." },
          { ad: "headway · time bar (integrated)", ne: "Plays the reverse-operation scenario over time." },
        ],
      },
      de: {
        faz: "Analyse", baslik: "Auswirkungen und Robustheit",
        anlatim: "Wenn Sie die Flotte ändern, aktualisieren sich die erreichte Taktzeit, Kapazität und Abstellüberlauf sowie die überlasteten Haltestellen sofort. Die Monte-Carlo-Analyse nennt Ihnen wiederum die kleinste Flotte, die Ihre Ziel-Zuverlässigkeit und den Komfort unter zufälligen Verspätungen hält.",
        amac: "Misst die realen Auswirkungen der gewählten Flotte und prüft, wie robust sie gegen zufällige Verspätungen ist.",
        girdi: "Die aktuelle Flotte; die mittlere Einfahrverspätung und Halteabweichung; ein Monte-Carlo mit 150 Läufen.",
        cikti: "Erreichte Taktzeit, Kapazität und Abstellüberlauf, überlastete Haltestellen; Pünktlichkeit unter zwei Minuten, Mittel, P90 und schlimmste Verspätung; ein Histogramm und Kehrvorschläge.",
        bolmeler: [
          { ad: "Live-Auswirkungen & Empfehlungen", ne: "Zeigt die vier Kennzahlen (Takt, Kapazität, Abstellung, Überlastung) und die Liste der Kehrvorschläge." },
          { ad: "Betrieb & Kehr (Integriert)", ne: "Spielt das Szenario mit manueller Zugfolgezeit und Zeitleiste; bindet die Kehrentscheidung an das reale herannahende Fahrzeug und zeigt den Gewinn." },
          { ad: "Monte-Carlo-Verspätungsanalyse", ne: "Simuliert 150 Läufe mit den eingegebenen Verspätungswerten und erzeugt die Pünktlichkeitsstatistik und das Verteilungshistogramm." },
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
        faz: "Sistem", baslik: "Kapasite ve kısıt",
        anlatim: "Hattı fiziksel olarak ne sınırlıyor? Bu bölüm belirleyici kısıtı, sinyal bloklarının meşguliyet sürelerini ve kilitleme tablosunu bir arada gösterir; kapasitenin kanonik yöntemlerle (Sperrzeit, UIC 406) nasıl hesaplandığını açar.",
        amac: "Hattın kapasitesini fiziksel olarak hangi etkenin sınırladığını, kabul görmüş kanonik yöntemlerle (Sperrzeit merdiveni, UIC 406 doluluk) gösterir.",
        girdi: "Birbiriyle yarışan beş sefer-aralığı kısıtı (blok, terminal dönüşü, tek hat, kavşak, sinyal), blok geometrisi ve UIC 406 doluluk hedefi.",
        cikti: "Hangi etkenin bağladığı ve ne kadar payı kaldığı; Sperrzeitentreppe merdiveni; her blok için altı bileşenli meşguliyet süresi; blok teşhisi ve çözümü; kilitleme kontrol tablosu.",
        bolmeler: [
          { ad: "Belirleyici Kısıt", ne: "Birbiriyle yarışan beş kısıtı yan yana çubukla gösterir; en uzun çubuk hattı bağlayandır. İstenirse kavşağın Sperrzeit dökümü de açılır." },
          { ad: "Sperrzeitentreppe & UIC 406", ne: "Zaman-mesafe merdivenini çizer; iki tren kritik blokta değdiği an sürdürülebilir en küçük sefer aralığı bulunur. Yanında en küçük aralık, teorik ve işletme kapasitesi ile UIC doluluk görünür." },
          { ad: "Blok başına meşguliyet bileşenleri", ne: "Her bloğun meşguliyet süresini altı parça olarak yığar: kurulum, görüş, yaklaşma, seyir, boşaltma ve serbest bırakma." },
          { ad: "Blok Teşhisi & Çözüm", ne: "Her blok için sınırlayan nedeni ve çözümünü verir; darboğazı ilgili modülde açan 'düzelt' butonlarını sunar." },
          { ad: "Kilitleme Kontrol Tablosu", ne: "Rota kurulumunu, makas konumunu ve kilit ilişkilerini (interlocking) gösterir." },
        ],
        butonlar: [
          { ad: "→ Ringler'de düzelt · → Sefer'de düzelt", ne: "Darboğaz bloğunu ilgili modülde açar." },
          { ad: "çekmeceleri aç", ne: "Sperrzeitentreppe · bileşen · teşhis · kilitleme çekmecelerini açar." },
        ],
      },
      en: {
        faz: "System", baslik: "Capacity and constraint",
        anlatim: "What physically limits the line? This section brings together the governing constraint, the occupancy times of the signal blocks and the interlocking table, and opens up how capacity is worked out with canonical methods (Sperrzeit, UIC 406).",
        amac: "Shows which factor physically limits the line's capacity, using accepted canonical methods (the Sperrzeit staircase, UIC 406 occupancy).",
        girdi: "Five competing headway constraints (block, terminal turnback, single track, junction, signal), the block geometry and the UIC 406 occupancy target.",
        cikti: "Which factor binds and how much margin is left; the Sperrzeitentreppe staircase; a six-component occupancy time for each block; the block diagnosis and fix; the interlocking control table.",
        bolmeler: [
          { ad: "Governing Constraint", ne: "Shows the five competing constraints as side-by-side bars; the longest bar is the one binding the line. The junction's Sperrzeit breakdown can be opened as well." },
          { ad: "Sperrzeitentreppe & UIC 406", ne: "Draws the time-distance staircase; the smallest sustainable headway is found at the point where two trains touch at the critical block. Alongside it you see the minimum headway, theoretical and operating capacity, and UIC occupancy." },
          { ad: "Occupancy components per block", ne: "Stacks each block's occupancy time into six parts: setup, sighting, approach, running, clearing and release." },
          { ad: "Block Diagnosis & Fix", ne: "Gives the limiting cause and its fix for each block, and offers 'fix' buttons that open the bottleneck in the relevant module." },
          { ad: "Interlocking Control Table", ne: "Shows the route setting, switch position and the lock relationships (interlocking)." },
        ],
        butonlar: [
          { ad: "→ Fix in Ringler · → Fix in Service", ne: "Opens the bottleneck block in the relevant module." },
          { ad: "open drawers", ne: "Opens the Sperrzeitentreppe · components · diagnosis · interlocking drawers." },
        ],
      },
      de: {
        faz: "System", baslik: "Kapazität und Engpass",
        anlatim: "Was begrenzt die Strecke physikalisch? Dieser Bereich bringt den maßgebenden Engpass, die Belegungszeiten der Signalblöcke und die Verschlusstabelle zusammen und zeigt, wie die Kapazität mit kanonischen Methoden (Sperrzeit, UIC 406) ermittelt wird.",
        amac: "Zeigt mit anerkannten kanonischen Methoden (Sperrzeitentreppe, UIC-406-Auslastung), welcher Faktor die Kapazität der Strecke physikalisch begrenzt.",
        girdi: "Fünf konkurrierende Zugfolgezeit-Engpässe (Block, Endstellenwende, Eingleis, Kreuzung, Signal), die Blockgeometrie und das UIC-406-Auslastungsziel.",
        cikti: "Welcher Faktor bindet und wie viel Reserve bleibt; die Sperrzeitentreppe; eine Belegungszeit aus sechs Komponenten je Block; die Blockdiagnose und -lösung; die Verschlusstabelle.",
        bolmeler: [
          { ad: "Maßgebender Engpass", ne: "Zeigt die fünf konkurrierenden Engpässe als nebeneinanderstehende Balken; der längste Balken bindet die Strecke. Die Sperrzeit-Aufschlüsselung der Kreuzung lässt sich ebenfalls öffnen." },
          { ad: "Sperrzeitentreppe & UIC 406", ne: "Zeichnet die Zeit-Weg-Treppe; die kleinste nachhaltige Zugfolgezeit ergibt sich dort, wo sich zwei Züge am kritischen Block berühren. Daneben sehen Sie die minimale Zugfolgezeit, theoretische und betriebliche Kapazität sowie UIC-Auslastung." },
          { ad: "Belegungskomponenten je Block", ne: "Stapelt die Belegungszeit jedes Blocks in sechs Teile: Einstellung, Sicht, Annäherung, Fahrt, Räumung und Auflösung." },
          { ad: "Blockdiagnose & Lösung", ne: "Gibt je Block die begrenzende Ursache und ihre Lösung und bietet 'Beheben'-Schaltflächen, die den Engpass im zuständigen Modul öffnen." },
          { ad: "Verschlusstabelle (Interlocking)", ne: "Zeigt Fahrstraßeneinstellung, Weichenlage und die Verschlussbeziehungen (Interlocking)." },
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
        faz: "Sistem", baslik: "Terminal ve yol etkileri",
        anlatim: "Tramvay hatlarını çoğu zaman terminaldeki dönüş sınırlar. Dönüş kapasitesi, makas geometrisinden ve peron sayısından hesaplanır; bu bölüm hangi ucun daha dar olduğunu ortaya çıkarır.",
        amac: "Terminaldeki dönüş kapasitesini ve hangi ucun hattı sınırladığını ortaya koyar.",
        girdi: "Terminal makas geometrisi (S ve X sayısı), peron sayısı ve platform işgal bileşenleri (varış, iniş, ters dönüş, kalkış, toparlanma).",
        cikti: "Her iki terminal ucunun dönüş kapasitesi ve hangi ucun, hangi alt etkenin belirleyici olduğu.",
        bolmeler: [
          { ad: "Terminal Turnback Kapasitesi", ne: "İki terminal ucunu yan yana gösterir; dönüş kapasitesini makasların S/X geometrisinden, peron sayısından ve boğaz işgalinden hesaplar ve belirleyici alt etkeni söyler." },
        ],
        butonlar: [
          { ad: "(bu bölmede ayar yoktur)", ne: "Terminal dönüş tipi, peron ve platform bileşenleri Ringler · Maksimum Tramvay Kapasitesi'nde ayarlanır." },
        ],
      },
      en: {
        faz: "System", baslik: "Terminal and line effects",
        anlatim: "Tram lines are most often limited by the turnback at the terminal. The turnback capacity is worked out from the switch geometry and the number of platforms, and this section reveals which end is the tighter one.",
        amac: "Reveals the turnback capacity at the terminal and which end limits the line.",
        girdi: "Terminal switch geometry (the count of S and X switches), the number of platforms and the platform-occupancy components (arrival, alighting, reversing, departure, recovery).",
        cikti: "The turnback capacity of each terminal end, and which end and which sub-factor is the governing one.",
        bolmeler: [
          { ad: "Terminal Turnback Capacity", ne: "Shows the two terminal ends side by side; it computes the turnback capacity from the switches' S/X geometry, the platform count and the throat occupancy, and names the governing sub-factor." },
        ],
        butonlar: [
          { ad: "(no settings in this pane)", ne: "Turnback type, platforms and throat components are set in Ringler · Maximum Tram Capacity." },
        ],
      },
      de: {
        faz: "System", baslik: "Endstellen- und Streckeneffekte",
        anlatim: "Straßenbahnstrecken werden meist durch die Wende an der Endstelle begrenzt. Die Wendekapazität ergibt sich aus der Weichengeometrie und der Bahnsteigzahl, und dieser Bereich zeigt, welches Ende das engere ist.",
        amac: "Zeigt die Wendekapazität an der Endstelle und welches Ende die Strecke begrenzt.",
        girdi: "Weichengeometrie der Endstelle (Anzahl der S- und X-Weichen), Bahnsteigzahl und Bahnsteigbelegungskomponenten (Ankunft, Ausstieg, Kehren, Abfahrt, Erholung).",
        cikti: "Die Wendekapazität jedes Endes und welches Ende und welcher Teilfaktor maßgebend ist.",
        bolmeler: [
          { ad: "Endstellen-Wendekapazität", ne: "Zeigt die beiden Enden nebeneinander; berechnet die Wendekapazität aus der S/X-Geometrie der Weichen, der Bahnsteigzahl und der Halsbelegung und benennt den maßgebenden Teilfaktor." },
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
        faz: "Sistem", baslik: "Filo ve kapasite kararı",
        anlatim: "Aynı temel kapasiteden iki ayrı karar çıkar: biri operasyonel (istediğiniz sefer aralığını hangi filo verir), diğeri risk odaklı (gecikmelere rağmen güvenilirliği korumak için en küçük filo). Tek hatlı kesimler için çakışmasız bir çizelge de burada çözülür.",
        amac: "Kapasite verisini somut bir filo kararına dönüştürür ve tek hatlı kesimlerdeki çakışmaları kalkış kaydırmasıyla giderir.",
        girdi: "Temel kapasite (çevrim, en küçük sefer aralığı, teorik tavan, önerilen filo), istediğiniz sefer aralığı ve gecikme profili.",
        cikti: "Operasyonel karar olarak istediğiniz aralığı veren filo; risk kararı olarak gecikmeye rağmen güvenilirlik ve konfor için en küçük filo; tek hat için çakışmasız çizelge.",
        bolmeler: [
          { ad: "Filo Kararı (Karar Destek)", ne: "Operasyonel karar: filo ile sefer aralığı arasında hedefe göre arama yapar, yani istediğiniz aralığı hangi filonun verdiğini bulur." },
          { ad: "Robust Filo", ne: "Risk kararı: Monte-Carlo ile, gecikmelere rağmen güvenilirlik ve konforu koruyan en küçük filoyu bulur." },
          { ad: "Çakışma Çözücüsü (tek hat)", ne: "Kalkış zamanlarını kaydırarak tek hattaki çakışmayı giderir ve çakışmasız bir çizelge üretir." },
        ],
        butonlar: [
          { ad: "filo · aralık hedefi", ne: "Operasyonel kararda hedefe göre çözer." },
          { ad: "çakışma çöz", ne: "Tek-hat çakışmasını kalkış offset'iyle giderir." },
        ],
      },
      en: {
        faz: "System", baslik: "Fleet and capacity decision",
        anlatim: "Two separate decisions come out of the same base capacity: one operational (which fleet gives the headway you want) and one risk-focused (the smallest fleet that keeps reliability despite delays). A clash-free schedule for single-track sections is also solved here.",
        amac: "Turns the capacity data into a concrete fleet decision and removes conflicts on single-track sections by shifting departures.",
        girdi: "The base capacity (cycle, minimum headway, theoretical ceiling, recommended fleet), the headway you want and the delay profile.",
        cikti: "As the operational decision, the fleet that gives the headway you want; as the risk decision, the smallest fleet for reliability and comfort despite delays; a clash-free schedule for single track.",
        bolmeler: [
          { ad: "Fleet Decision (Decision Support)", ne: "The operational decision: it searches between fleet and headway toward your target, finding which fleet gives the headway you want." },
          { ad: "Robust Fleet", ne: "The risk decision: using Monte-Carlo, it finds the smallest fleet that keeps reliability and comfort despite delays." },
          { ad: "Conflict Resolver (single track)", ne: "Shifts departure times to remove the conflict on single track and produces a clash-free schedule." },
        ],
        butonlar: [
          { ad: "fleet · headway target", ne: "Solves the operational decision toward the target." },
          { ad: "resolve conflict", ne: "Removes single-track conflict with departure offsets." },
        ],
      },
      de: {
        faz: "SYSTEM · ENTSCHEIDUNG", baslik: "Flotten- & Kapazitätsentscheidung",
        anlatim: "Aus derselben Grundkapazität ergeben sich zwei getrennte Entscheidungen: eine betriebliche (welche Flotte liefert die gewünschte Zugfolgezeit) und eine risikoorientierte (die kleinste Flotte, die die Zuverlässigkeit trotz Verspätungen hält). Auch ein konfliktfreier Fahrplan für eingleisige Abschnitte wird hier gelöst.",
        amac: "Macht aus den Kapazitätsdaten eine konkrete Flottenentscheidung und beseitigt Konflikte auf eingleisigen Abschnitten durch Verschieben der Abfahrten.",
        girdi: "Die Grundkapazität (Umlauf, minimale Zugfolgezeit, theoretische Obergrenze, empfohlene Flotte), die gewünschte Zugfolgezeit und das Verspätungsprofil.",
        cikti: "Als betriebliche Entscheidung die Flotte, die die gewünschte Zugfolgezeit liefert; als Risikoentscheidung die kleinste Flotte für Zuverlässigkeit und Komfort trotz Verspätungen; ein konfliktfreier Fahrplan für Eingleis.",
        bolmeler: [
          { ad: "Flottenentscheidung (Entscheidungshilfe)", ne: "Die betriebliche Entscheidung: Sie sucht zwischen Flotte und Zugfolgezeit auf Ihr Ziel hin und findet, welche Flotte die gewünschte Zugfolgezeit liefert." },
          { ad: "Robuste Flotte", ne: "Die Risikoentscheidung: Mit Monte-Carlo findet sie die kleinste Flotte, die Zuverlässigkeit und Komfort trotz Verspätungen hält." },
          { ad: "Konfliktlöser (Eingleis)", ne: "Verschiebt Abfahrtszeiten, um den Konflikt auf eingleisiger Strecke zu beseitigen, und erzeugt einen konfliktfreien Fahrplan." },
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
        faz: "Sistem", baslik: "Motor doğruluğu",
        anlatim: "Sonuçlara neden güvenebilirsiniz? Doğrulama ve Geçerleme (V&V) bölümü, motorun ürettiği değerleri kabul görmüş kanonik referanslarla (UIC, Sperrzeit) karşılaştırarak sertifikalar. Yani sayılar bir yapay zekânın tahmini değil, mühendislik disipliniyle doğrulanmış sonuçlardır.",
        amac: "Simülasyon sonuçlarını kanonik analitik referanslarla (UIC 406, Sperrzeit) karşılaştırarak motorun doğruluğunu belgeler.",
        girdi: "Motorun çıktıları ve bunlara karşılık gelen kanonik, kapalı-form referans değerleri.",
        cikti: "Her kontrol için beklenen değer, bulunan değer, aradaki sapma ve geçti/kaldı durumu.",
        bolmeler: [
          { ad: "Doğrulama & Geçerleme (V&V)", ne: "Kanonik referanslara karşı bir kontrol tablosu sunar; her satır bir kanonik testi sertifikalar." },
        ],
        butonlar: [
          { ad: "çekmeceyi aç", ne: "V&V kontrol tablosunu açar." },
        ],
      },
      en: {
        faz: "System", baslik: "Engine accuracy",
        anlatim: "Why can you trust the results? The Verification & Validation (V&V) section certifies the values the engine produces against accepted canonical references (UIC, Sperrzeit). In other words, the numbers are not an AI's guess but results verified with engineering discipline.",
        amac: "Documents the engine's accuracy by comparing the simulation results against canonical analytical references (UIC 406, Sperrzeit).",
        girdi: "The engine's outputs and the matching canonical, closed-form reference values.",
        cikti: "For each check: the expected value, the found value, the deviation between them and the pass/fail status.",
        bolmeler: [
          { ad: "Verification & Validation (V&V)", ne: "Presents a control table against canonical references; each row certifies one canonical test." },
        ],
        butonlar: [
          { ad: "open drawer", ne: "Opens the V&V control table." },
        ],
      },
      de: {
        faz: "System", baslik: "Modellgenauigkeit",
        anlatim: "Warum können Sie den Ergebnissen trauen? Der Bereich Verifizierung & Validierung (V&V) zertifiziert die vom Modell erzeugten Werte gegen anerkannte kanonische Referenzen (UIC, Sperrzeit). Die Zahlen sind also keine Schätzung einer KI, sondern mit Ingenieurdisziplin verifizierte Ergebnisse.",
        amac: "Dokumentiert die Genauigkeit des Modells durch Vergleich der Simulationsergebnisse mit kanonischen analytischen Referenzen (UIC 406, Sperrzeit).",
        girdi: "Die Ausgaben des Modells und die passenden kanonischen, geschlossenen Referenzwerte.",
        cikti: "Je Prüfung: der erwartete Wert, der gefundene Wert, die Abweichung dazwischen und der Bestanden-/Durchgefallen-Status.",
        bolmeler: [
          { ad: "Verifizierung & Validierung (V&V)", ne: "Zeigt eine Kontrolltabelle gegen kanonische Referenzen; jede Zeile zertifiziert einen kanonischen Test." },
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
        faz: "Belgeleme", baslik: "Profesyonel rapor",
        anlatim: "Yaptığınız bütün analiz, markalı ve baskıya hazır bir PDF dokümana dönüşür. Rapordaki her sayı, hangi girdiden ve hangi yöntemle çıktığıyla birlikte verilir; bu yüzden sonuç baştan sona izlenebilir kalır.",
        amac: "Tüm analizi markalı bir PDF dokümana dönüştürür ve hattı railML ya da GTFS olarak dışa aktarır.",
        girdi: "Proje hattı, parametreler ve künye bilgileri (proje ve hat adı, doküman numarası, revizyon, idare, yüklenici), logo, rapor dili ve rapora girecek bölümler.",
        cikti: "Her sayının girdisi ve yöntemiyle künyelendiği, izlenebilir bir PDF; isteğe bağlı bir müşteri-sunumu sürümü; railML (.xml) ve GTFS (.zip) dosyaları.",
        bolmeler: [
          { ad: "Proje Künyesi", ne: "Kapakta yer alacak bilgileri (proje ve hat adı, doküman numarası, idare, yüklenici) ve logoyu belirlersiniz." },
          { ad: "PDF Rapor", ne: "Rapor dilini, kapaktaki QR bağlantısını, rapora girecek bölümleri ve müşteri-sunumu seçeneğini buradan ayarlarsınız." },
          { ad: "Dışa Aktar", ne: "Hattı railML (.xml) ve GTFS (.zip) olarak ücretsiz indirirsiniz; OpenTrack/RailSys ya da harita ve ulaşım uygulamaları için kullanılır." },
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
        faz: "Documentation", baslik: "Professional report",
        anlatim: "All the analysis you've done turns into a branded, print-ready PDF document. Every number in the report is given together with the input it came from and the method used, so the result stays traceable from start to finish.",
        amac: "Turns the whole analysis into a branded PDF document and exports the line as railML or GTFS.",
        girdi: "The project line, the parameters and the title-block details (project and line name, document number, revision, authority, contractor), the logo, the report language and the sections to include.",
        cikti: "A traceable PDF where every number carries its input and method; an optional client-presentation version; railML (.xml) and GTFS (.zip) files.",
        bolmeler: [
          { ad: "Project Details", ne: "You set the information for the cover (project and line name, document number, authority, contractor) and the logo." },
          { ad: "PDF Report", ne: "Here you set the report language, the QR link on the cover, the sections to include and the client-presentation option." },
          { ad: "Export", ne: "You download the line for free as railML (.xml) and GTFS (.zip); used for OpenTrack/RailSys or map and transit apps." },
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
        faz: "Dokumentation", baslik: "Professioneller Bericht",
        anlatim: "Die gesamte Analyse wird zu einem markierten, druckfertigen PDF-Dokument. Jede Zahl im Bericht steht zusammen mit der Eingabe, aus der sie stammt, und der verwendeten Methode, sodass das Ergebnis von Anfang bis Ende nachvollziehbar bleibt.",
        amac: "Macht aus der gesamten Analyse ein markiertes PDF-Dokument und exportiert die Strecke als railML oder GTFS.",
        girdi: "Die Projektstrecke, die Parameter und die Deckblattangaben (Projekt- und Linienname, Dokumentnummer, Revision, Behörde, Auftragnehmer), das Logo, die Berichtssprache und die enthaltenen Abschnitte.",
        cikti: "Ein nachvollziehbares PDF, in dem jede Zahl ihre Eingabe und Methode trägt; eine optionale Kundenpräsentationsversion; railML-(.xml)- und GTFS-(.zip)-Dateien.",
        bolmeler: [
          { ad: "Projektangaben", ne: "Sie legen die Angaben für das Deckblatt (Projekt- und Linienname, Dokumentnummer, Behörde, Auftragnehmer) und das Logo fest." },
          { ad: "PDF-Bericht", ne: "Hier stellen Sie die Berichtssprache, den QR-Link auf dem Deckblatt, die enthaltenen Abschnitte und die Kundenpräsentationsoption ein." },
          { ad: "Export", ne: "Sie laden die Strecke kostenlos als railML (.xml) und GTFS (.zip) herunter; für OpenTrack/RailSys oder Karten- und Transit-Apps." },
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
        faz: "Karşılaştırma", baslik: "Senaryo karşılaştırma",
        anlatim: "Farklı senaryoları ya da projeleri yan yana koyar ve kararı sayılara dayandırırsınız. Hangi tasarımın hangi kapasiteyi, hangi filoyla ve hangi maliyetle verdiğini objektif biçimde görürsünüz.",
        amac: "Projeleri ya da aynı hattın parametre varyantlarını yan yana koyarak sayıya dayalı, objektif bir karar sunar.",
        girdi: "İki ila dört kayıtlı proje; ya da aktif hatta tek bir parametrenin (doluluk tavanı veya sefer aralığı) iki ila dört değeri.",
        cikti: "Karar tablosu (her satırda en iyi değer altınla işaretli), çubuk kıyaslamaları, objektif öneri özeti ve PDF karşılaştırma raporu.",
        bolmeler: [
          { ad: "Mod seçici", ne: "Projeleri karşılaştırma ile tek hatta What-if arasında geçiş yaparsınız." },
          { ad: "Projeleri Seç / What-if", ne: "Karşılaştırma kolonlarını belirler: iki-dört proje ya da bir parametrenin iki-dört değeri." },
          { ad: "Objektif Öneri Özeti", ne: "En yüksek sürdürülebilir kapasiteyi, en az filo ihtiyacını, en kısa çevrimi ve en yüksek işletme kapasitesini bulup her birinde kazananı adıyla söyler." },
          { ad: "Karar tablosu ve çubuk kıyaslar", ne: "Göstergeleri kolon kolon dizer (altın hücre o satırın en iyisidir) ve teorik tavan, işletme kapasitesi ile gereken filoyu çubuklarla karşılaştırır." },
        ],
        butonlar: [
          { ad: "Projeler · What-if", ne: "Karşılaştırma modunu seçer." },
          { ad: "proje seç (2–4) · parametre + değer ekle", ne: "Karşılaştırma kolonlarını kurar." },
          { ad: "🖨 PDF Karşılaştırma Raporu", ne: "Baskıya hazır karar raporunu üretir (kredi düşer)." },
        ],
      },
      en: {
        faz: "Comparison", baslik: "Scenario comparison",
        anlatim: "You put different scenarios or projects side by side and base the decision on numbers. You see objectively which design delivers which capacity, with which fleet and at which cost.",
        amac: "Puts projects, or parameter variants of the same line, side by side and offers a number-based, objective decision.",
        girdi: "Two to four saved projects; or two to four values of a single parameter (occupancy ceiling or headway) on the active line.",
        cikti: "A decision table (the best value in each row marked in gold), bar comparisons, an objective recommendation summary and a PDF comparison report.",
        bolmeler: [
          { ad: "Mode selector", ne: "You switch between comparing projects and a What-if on a single line." },
          { ad: "Pick Projects / What-if", ne: "Sets the comparison columns: two to four projects, or two to four values of one parameter." },
          { ad: "Objective Recommendation Summary", ne: "Finds the highest sustainable capacity, the lowest fleet need, the shortest cycle and the highest operating capacity, and names the winner of each." },
          { ad: "Decision table and bar comparisons", ne: "Lays the indicators out column by column (the gold cell is the best in that row) and compares the theoretical ceiling, operating capacity and required fleet with bars." },
        ],
        butonlar: [
          { ad: "Projects · What-if", ne: "Selects the comparison mode." },
          { ad: "pick projects (2–4) · add parameter + value", ne: "Sets up the comparison columns." },
          { ad: "🖨 PDF Comparison Report", ne: "Produces the print-ready decision report (credits deducted)." },
        ],
      },
      de: {
        faz: "Vergleich", baslik: "Szenarienvergleich",
        anlatim: "Sie stellen verschiedene Szenarien oder Projekte nebeneinander und stützen die Entscheidung auf Zahlen. Sie sehen objektiv, welcher Entwurf welche Kapazität mit welcher Flotte und zu welchen Kosten liefert.",
        amac: "Stellt Projekte oder Parametervarianten derselben Strecke nebeneinander und bietet eine zahlenbasierte, objektive Entscheidung.",
        girdi: "Zwei bis vier gespeicherte Projekte; oder zwei bis vier Werte eines einzelnen Parameters (Auslastungsgrenze oder Zugfolgezeit) der aktiven Strecke.",
        cikti: "Eine Entscheidungstabelle (der beste Wert jeder Zeile in Gold), Balkenvergleiche, eine objektive Empfehlungsübersicht und ein PDF-Vergleichsbericht.",
        bolmeler: [
          { ad: "Modusauswahl", ne: "Sie wechseln zwischen dem Vergleich von Projekten und einem What-if auf einer einzelnen Strecke." },
          { ad: "Projekte wählen / What-if", ne: "Legt die Vergleichsspalten fest: zwei bis vier Projekte oder zwei bis vier Werte eines Parameters." },
          { ad: "Objektive Empfehlungsübersicht", ne: "Findet die höchste nachhaltige Kapazität, den geringsten Flottenbedarf, den kürzesten Umlauf und die höchste betriebliche Kapazität und benennt jeweils den Sieger." },
          { ad: "Entscheidungstabelle und Balkenvergleiche", ne: "Ordnet die Indikatoren spaltenweise an (die goldene Zelle ist die beste der Zeile) und vergleicht theoretische Obergrenze, betriebliche Kapazität und nötige Flotte mit Balken." },
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
      tr: { faz: "Kapanış", baslik: "Kur → Analiz → Karar", anlatim: "Özetle akış bu: gerçek veriyle kurun, mikroskobik fizikle simüle edin, kanonik yöntemlerle doğrulayıp raporlayın. Sıra sizde; kendi hattınızla deneyin." },
      en: { faz: "Wrap-up", baslik: "Build → Analyze → Decide", anlatim: "That, in short, is the flow: build from real data, simulate with microscopic physics, validate with canonical methods and report. Now it's your turn; try it with your own line." },
      de: { faz: "Abschluss", baslik: "Aufbauen → Analysieren → Entscheiden", anlatim: "Das ist kurz gesagt der Ablauf: aus echten Daten aufbauen, mit mikroskopischer Physik simulieren, mit kanonischen Methoden validieren und dokumentieren. Jetzt sind Sie dran; probieren Sie es mit Ihrer eigenen Strecke." },
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
      <div className="font-brand text-[0.6875rem] font-bold tracking-[0.1em]" style={{ color: "#E7D9B0" }}>{etiket}</div>
      <div className="mt-1 text-sm leading-relaxed" style={{ color: "#DCE6EF" }}>{deger}</div>
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
          <li key={k} className="flex gap-2 text-sm leading-relaxed" style={{ color: "#C7D5E1" }}>
            <span aria-hidden="true" className="mt-0.5" style={{ color: brand.gold }}>{isaret}</span>
            <span><b className="font-semibold text-white">{o.ad}:</b> {o.ne}</span>
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
        <div className="font-brand text-xs font-semibold tracking-[0.12em]" style={{ color: "#E7D9B0" }}>{m.faz}</div>
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
              <div className="font-brand text-xs font-semibold tracking-[0.1em]" style={{ color: "#E7D9B0" }}>
                {m.faz}<span className="ml-1.5 font-mono tracking-normal" style={{ color: "#7E93A6" }}>{i + 1}/{TOPLAM}</span>
              </div>
              <div className="text-base font-semibold text-white">{m.baslik}</div>
            </div>
          </div>

          {/* özet anlatım (üst satırda, kısa) */}
          <p className="min-w-0 flex-1 text-sm leading-relaxed sm:px-3" style={{ color: "#CBD8E3" }}>{m.anlatim}</p>

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
                    {ADIMLAR[k].metin[dil].baslik}
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
