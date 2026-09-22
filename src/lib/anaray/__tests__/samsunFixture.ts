// OTOMATİK ÜRETİLDİ — Samsun Tramvayı GERÇEK OSM verisi (rel 15351430 + 15351429, 2026-09-22).
// Kaynak: /api/geometri/osm/rota mod:hat. © OpenStreetMap · ODbL.
// (Test fikstürü — canlı içe-aktarma yolu backend'dir; bu yalnız motor sweep testi içindir.)
import type { OsmSegment } from "../osmHat";

export const SAMSUN_SEGMENTLER: OsmSegment[] = [
  {
    ad: "1: OMÜ Rektörlük → Gar",
    duraklar: [{ ad: "Eczaneler", lat: 41.3713, lon: 36.2253 }, { ad: "Körfez", lat: 41.3667, lon: 36.2272 }, { ad: "Pelitköy", lat: 41.3614, lon: 36.2299 }, { ad: "Kurupelit", lat: 41.3555, lon: 36.2347 }, { ad: "Yeni Mahalle", lat: 41.3517, lon: 36.2375 }, { ad: "Atakent", lat: 41.3439, lon: 36.2448 }, { ad: "Çobanlı", lat: 41.339, lon: 36.2521 }, { ad: "Ömürevleri", lat: 41.3368, lon: 36.2587 }, { ad: "Türk-İş", lat: 41.3324, lon: 36.2697 }, { ad: "Mimar Sinan", lat: 41.3296, lon: 36.2813 }, { ad: "Atakum Belediyesi", lat: 41.3273, lon: 36.2862 }, { ad: "Denizevleri", lat: 41.3242, lon: 36.2957 }, { ad: "Karayolları", lat: 41.3231, lon: 36.3055 }, { ad: "Güzel Sanatlar", lat: 41.3219, lon: 36.3135 }, { ad: "Baruthane - Kalkancı", lat: 41.3207, lon: 36.3219 }, { ad: "Samsun Müzesi / Fener", lat: 41.3105, lon: 36.3355 }, { ad: "Gençlik Parkı", lat: 41.3051, lon: 36.3319 }, { ad: "Liman", lat: 41.2995, lon: 36.3323 }, { ad: "Büyük Cami / Opera", lat: 41.2956, lon: 36.3337 }, { ad: "Cumhuriyet Meydanı", lat: 41.2905, lon: 36.3366 }, { ad: "Gar", lat: 41.2867, lon: 36.3405 }],
    geometri: [[41.3713, 36.2253], [41.3699, 36.2262], [41.3629, 36.2282], [41.3587, 36.2327], [41.3528, 36.2367], [41.3479, 36.2408], [41.3397, 36.2495], [41.3375, 36.2572], [41.3332, 36.2656], [41.3295, 36.2817], [41.3248, 36.2909], [41.324, 36.2947], [41.3247, 36.2989], [41.3242, 36.3018], [41.322, 36.3095], [41.3219, 36.3145], [41.321, 36.3207], [41.3187, 36.3298], [41.3161, 36.3342], [41.3139, 36.3357], [41.3111, 36.3358], [41.3045, 36.3315], [41.3033, 36.331], [41.2934, 36.3345], [41.2893, 36.3375], [41.2867, 36.3405]],
  },
  {
    ad: "2: Gar → Stadyum",
    duraklar: [{ ad: "Gar", lat: 41.2867, lon: 36.3405 }, { ad: "Kılıçdede", lat: 41.2826, lon: 36.3463 }, { ad: "Samsunspor", lat: 41.2768, lon: 36.3558 }, { ad: "Belediye Evleri", lat: 41.2731, lon: 36.3653 }, { ad: "Mavi Işıklar", lat: 41.2705, lon: 36.3732 }, { ad: "Balıkçı Barınağı", lat: 41.2665, lon: 36.3797 }, { ad: "Asarağaç", lat: 41.2482, lon: 36.3975 }, { ad: "Kirazlık", lat: 41.2455, lon: 36.4019 }, { ad: "Örnek Sanayi", lat: 41.2416, lon: 36.4079 }, { ad: "İlkadım Sanayi", lat: 41.2378, lon: 36.4136 }, { ad: "19 Mayıs Sanayi", lat: 41.2339, lon: 36.4197 }, { ad: "Organize Sanayi", lat: 41.2302, lon: 36.4254 }, { ad: "Kerimbey", lat: 41.2292, lon: 36.4306 }, { ad: "Cumhuriyet", lat: 41.2283, lon: 36.4409 }, { ad: "Tekkeköy", lat: 41.2251, lon: 36.4533 }],
    geometri: [[41.2867, 36.3405], [41.2817, 36.3476], [41.2808, 36.3503], [41.2784, 36.3529], [41.2773, 36.3547], [41.2735, 36.3644], [41.2703, 36.374], [41.2684, 36.377], [41.2646, 36.3822], [41.2629, 36.3838], [41.2614, 36.3844], [41.2571, 36.3847], [41.2558, 36.3856], [41.2523, 36.3929], [41.2492, 36.3957], [41.2286, 36.4277], [41.2285, 36.4294], [41.2299, 36.4319], [41.229, 36.4355], [41.2287, 36.4399], [41.2275, 36.4435], [41.226, 36.4449], [41.2248, 36.4508], [41.2255, 36.4553], [41.2289, 36.4556]],
  },
];
