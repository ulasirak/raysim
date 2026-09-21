#!/usr/bin/env python3
# raysim — KONYA BÜTÜNLEŞİK hat GTFS (mevcut OSM + etap1 CAD + etap2 OSM-koridor).
# 30 istasyon gerçek koordinatla → tek-tıkla içe aktar → Bütünleşik haritada görünür.
import json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from konya_gtfs import build

SP = r"C:/Users/ulasi/AppData/Local/Temp/claude/C--Users-ulasi/10e64f71-ac52-4ae0-b012-3312e2a16c7f/scratchpad/cad"
ORDER = ["Alaattin", "Hükümet", "Mevlana", "Mevlana Kültür Merkezi", "Fetih", "Spor ve Kongre Merkezi", "Karşehir", "Adliye", "Adliye (Lise/Okullar)", "Şehir Hastanesi", "Rezerv İstasyonu", "Ereğli Kavşağı", "Şehir Parkı", "Depo", "Sedirler Kavşağı", "Hüdai", "Büsan Sanayi", "Motorlu Taşıtlar Sanayisi", "Gülistan Caddesi", "Ravza Camii", "Aslım Sanayi", "TÜMOSAN", "TÜYAP", "Banliyö Aktarma", "Betoncular", "Yurtlar Bölgesi", "Otogar", "Selçuklu Belediyesi", "Barış Caddesi", "Stadyum"]

osm = json.load(open(SP + "/osm_ist.json", encoding="utf-8"))
etap1 = json.load(open(SP + "/etap1_coords.json", encoding="utf-8"))
etap2 = json.load(open(SP + "/etap2_coords.json", encoding="utf-8"))

def norm(s):
    s = s.lower().replace("ı", "i").replace("İ", "i").replace("ş", "s").replace("ğ", "g").replace("ü", "u").replace("ö", "o").replace("ç", "c")
    return re.sub(r"[^a-z0-9]", "", s)
ALIAS = {"alaattin": "alaaddin"}
idx = {norm(o["ad"]): o for o in osm}
def osmesle(nm):
    k = norm(nm); k = ALIAS.get(k, k)
    if k in idx: return idx[k]
    for kk, v in idx.items():
        if len(k) >= 5 and (k in kk or kk in k): return v
    return None

coords = {}
for nm in ORDER[:8]:  # mevcut → OSM
    o = osmesle(nm)
    if o: coords[nm] = {"lat": o["lat"], "lon": o["lon"]}
coords.update({k: v for k, v in etap1.items()})   # etap1 (Adliye (Lise/Okullar), Şehir Hastanesi..Aslım)
coords.update({k: v for k, v in etap2.items()})   # etap2 (Stadyum..Aslım)

eksik = [n for n in ORDER if n not in coords]
print("# eksik koordinat:", eksik or "YOK")
if eksik: sys.exit("eksik var — GTFS üretilmedi")

shape = [[coords[n]["lat"], coords[n]["lon"]] for n in ORDER]
data = build("BUT", "Konya Tramvay — Bütünleşik Hat (Alaaddin–Stadyum)", "Bütünleşik", ORDER, coords, shape)
out = sys.argv[1] if len(sys.argv) > 1 else SP
path = out + "/konya_birlesik.zip"
open(path, "wb").write(data)
print(f"# yazıldı: {path} ({len(data)} bayt, {len(ORDER)} durak)")
