#!/usr/bin/env python3
# raysim — Konya etap hatları için GERÇEK KOORDİNATLI GTFS .zip üretir (import ile projeye
# yazılır → gömülü DEĞİL). stops.txt = gerçek durak lat/lon; shapes.txt = gerçek merkez-hat
# geometrisi (viraj dâhil); trips/stop_times/routes/calendar/agency. Kaynak: CAD güzergâh
# (HAT1 alignment) + kilometraj, OSM-hizalı (scripts/etap1_projekte.py çıktısı) · © OSM ODbL.
import json, zipfile, io, sys

SP = r"C:/Users/ulasi/AppData/Local/Temp/claude/C--Users-ulasi/10e64f71-ac52-4ae0-b012-3312e2a16c7f/scratchpad/cad"

def build(key, hat_adi, route_short, istasyonlar, coords, shape, hiz_ms=8.3, dwell=20):
    """istasyonlar: sıralı ad listesi; coords: {ad:{lat,lon}}; shape: [[lat,lon],...]"""
    import math
    def hav(a, b):
        R = 6371000; r = math.radians
        dl = r(b[0] - a[0]); do = r(b[1] - a[1])
        h = math.sin(dl / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(do / 2) ** 2
        return 2 * R * math.asin(min(1, math.sqrt(h)))
    def sid(i): return f"{key}_S{i:02d}"
    # stop_times zamanları: durak-arası mesafe / hız + dwell (kümülatif)
    stops_csv = ["stop_id,stop_name,stop_lat,stop_lon"]
    for i, ad in enumerate(istasyonlar):
        c = coords[ad]; stops_csv.append(f'{sid(i)},"{ad}",{c["lat"]:.6f},{c["lon"]:.6f}')
    st_csv = ["trip_id,arrival_time,departure_time,stop_id,stop_sequence"]
    t = 6 * 3600
    def hms(s): s = int(s); return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}"
    for i, ad in enumerate(istasyonlar):
        if i > 0:
            a = coords[istasyonlar[i - 1]]; b = coords[ad]
            t += max(20, hav((a["lat"], a["lon"]), (b["lat"], b["lon"])) / hiz_ms)
        varis = t; kalkis = t + (dwell if 0 < i < len(istasyonlar) - 1 else 0)
        st_csv.append(f"T0,{hms(varis)},{hms(kalkis)},{sid(i)},{i+1}")
        t = kalkis
    shp_csv = ["shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence"]
    for i, (la, lo) in enumerate(shape):
        shp_csv.append(f"shp0,{la:.6f},{lo:.6f},{i+1}")
    files = {
        "agency.txt": "agency_id,agency_name,agency_url,agency_timezone,agency_lang\nAYGM,AYGM Konya Tramvay,https://raysim.vercel.app,Europe/Istanbul,tr\n",
        "stops.txt": "\n".join(stops_csv) + "\n",
        "routes.txt": f'route_id,agency_id,route_short_name,route_long_name,route_type\nR0,AYGM,{route_short},"{hat_adi}",0\n',
        "trips.txt": "route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n"
                     f'R0,HAFTAICI,T0,"{istasyonlar[-1]}",0,shp0\n',
        "stop_times.txt": "\n".join(st_csv) + "\n",
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nHAFTAICI,1,1,1,1,1,1,1,20260101,20261231\n",
        "shapes.txt": "\n".join(shp_csv) + "\n",
        "feed_info.txt": "feed_publisher_name,feed_publisher_url,feed_lang,feed_version\nRaySim,https://raysim.vercel.app,tr,2026\n",
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, c in files.items(): z.writestr(n, c)
    return buf.getvalue()


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else SP
    ETAP1 = ["Aslım Sanayi", "Ravza Camii", "Gülistan Caddesi", "Motorlu Taşıtlar Sanayisi", "Büsan Sanayi", "Hüdai", "Sedirler Kavşağı", "Depo", "Şehir Parkı", "Ereğli Kavşağı", "Rezerv İstasyonu", "Şehir Hastanesi", "Adliye (Lise/Okullar)"]
    coords = json.load(open(SP + "/etap1_coords.json", encoding="utf-8"))
    shape = json.load(open(SP + "/etap1_shape.json", encoding="utf-8"))
    data = build("E1", "Konya Tramvay 1. Etap — Aslım Sanayi–Adliye", "1. Etap", ETAP1, coords, shape)
    path = out_dir + "/konya_etap1.zip"
    open(path, "wb").write(data)
    print(f"# yazıldı: {path} ({len(data)} bayt, {len(shape)} shape noktası, {len(ETAP1)} durak)")
