#!/usr/bin/env python3
# raysim — etap1 istasyonlarını GERÇEK CAD merkez-hattı (HAT1 tik'leri) + kilometraj ile
# üret; transform'u OSM inşaat hattına ICP ile hizalayarak (label gürültüsüne bağımsız)
# türet; sonucu OSM'e bindirerek DOĞRULA. Çıktı: etap1 istasyon lat/lon + kalıntı.
import json, math, sys

SP = r"C:/Users/ulasi/AppData/Local/Temp/claude/C--Users-ulasi/10e64f71-ac52-4ae0-b012-3312e2a16c7f/scratchpad/cad"
ticks = json.load(open(SP + "/mevcut_ticks.json", encoding="utf-8"))          # [[E,N],...] HAT1 (UTM, mevcut frame)
osm_ins = json.load(open(SP + "/osm_insaat.json", encoding="utf-8"))          # [{insaat, noktalar:[[lat,lon],...]},...]

# --- yerel metre çerçevesi (Konya) ---
R = 6371000.0; D2R = math.pi / 180; lat0 = 37.87 * D2R
def m_x(lon): return R * lon * D2R * math.cos(lat0)
def m_y(lat): return R * lat * D2R
def dm(a_lon, a_lat, b_lon, b_lat): return math.hypot(m_x(a_lon) - m_x(b_lon), m_y(a_lat) - m_y(b_lat))

# --- label-afin (bootstrap): mevcut 6 etiketten UTM->WGS84 kaba dönüşüm ---
labels = [(455452.78,4193589.60,32.4935,37.8716),(455802.31,4193412.44,32.4977,37.8721),
          (456577.05,4193239.38,32.5066,37.8706),(457278.38,4193237.28,32.5156,37.8705),
          (458280.58,4193176.35,32.5253,37.8701),(459783.70,4192111.16,32.5430,37.8614)]
def fit_affine(src, dst):
    # dst = a*x + b*y + c ; en küçük kareler (3x3 normal denklem)
    ATA=[[0]*3 for _ in range(3)]; ATb=[0]*3
    for (x,y),t in zip(src,dst):
        row=[x,y,1.0]
        for i in range(3):
            for j in range(3): ATA[i][j]+=row[i]*row[j]
            ATb[i]+=row[i]*t
    # 3x3 çöz (Gauss)
    import copy; M=copy.deepcopy(ATA); v=ATb[:]
    for i in range(3):
        p=max(range(i,3),key=lambda r:abs(M[r][i])); M[i],M[p]=M[p],M[i]; v[i],v[p]=v[p],v[i]
        for r in range(3):
            if r!=i:
                f=M[r][i]/M[i][i]
                for c in range(3): M[r][c]-=f*M[i][c]
                v[r]-=f*v[i]
    return [v[i]/M[i][i] for i in range(3)]

src=[(E,N) for E,N,lo,la in labels]
clon=fit_affine(src,[lo for _,_,lo,la in labels])
clat=fit_affine(src,[la for _,_,lo,la in labels])
def aff(E,N): return (clon[0]*E+clon[1]*N+clon[2], clat[0]*E+clat[1]*N+clat[2])

# --- HAT1 tik'lerini sırala (en yakın komşu, bir uçtan) ---
pts=ticks[:]
# başlangıç: en güneybatı (min E+N) uç
start=min(range(len(pts)),key=lambda i:pts[i][0]+pts[i][1])
order=[start]; used=set([start])
cur=start
while len(order)<len(pts):
    cx,cy=pts[cur]; best=-1;bd=1e18
    for i in range(len(pts)):
        if i in used: continue
        d=(pts[i][0]-cx)**2+(pts[i][1]-cy)**2
        if d<bd: bd=d;best=i
    if best<0 or bd>200**2: break   # kopukluk -> dur
    order.append(best);used.add(best);cur=best
poly_utm=[pts[i] for i in order]
print(f"# HAT1 sıralı nokta: {len(poly_utm)}/{len(pts)}")

# OSM inşaat noktaları (metre frame'de) — ICP hedefi
osm_pts=[]
for w in osm_ins:
    for lat,lon in w["noktalar"]:
        osm_pts.append((m_x(lon),m_y(lat)))

def utm_to_ll(E,N): return aff(E,N)   # başlangıç
# ICP: her iterasyonda HAT1'i mevcut transformla WGS84->metre'ye taşı, en yakın OSM noktası
# ile eşle, yeni afin (UTM->metre) fit et. transform'u afin (UTM E,N -> metre x,y) tut.
# metre x = mx(lon), y = my(lat). Başlangıç afin: label affine -> ll -> metre.
def cur_xy(E,N):
    lo,la=aff(E,N); return (m_x(lo),m_y(la))
# başlangıç afin katsayıları (UTM->metre)
mxlon=[clon[0],clon[1],clon[2]]; mylat=[clat[0],clat[1],clat[2]]
# metre afin: x = m_x(lon)=Rcos*lon*D2R -> lineer; y=m_y(lat). Yeni fit doğrudan (E,N)->(x,y).
Ax=fit_affine(poly_utm,[cur_xy(E,N)[0] for E,N in poly_utm])
Ay=fit_affine(poly_utm,[cur_xy(E,N)[1] for E,N in poly_utm])
def tf(E,N): return (Ax[0]*E+Ax[1]*N+Ax[2], Ay[0]*E+Ay[1]*N+Ay[2])

# OSM noktaları için basit grid arama yerine lineer (küçük veri: 48 yol ~ birkaç yüz nokta)
def nearest_osm(x,y):
    bd=1e18;bp=None
    for ox,oy in osm_pts:
        d=(ox-x)**2+(oy-y)**2
        if d<bd: bd=d;bp=(ox,oy)
    return bp,math.sqrt(bd)

for it in range(12):
    S=[];Dx=[];Dy=[];res=[]
    for E,N in poly_utm:
        x,y=tf(E,N); (ox,oy),d=nearest_osm(x,y)
        if d>120: continue     # uzak -> eşleme dışı (yanlış koridor gürültüsü)
        S.append((E,N));Dx.append(ox);Dy.append(oy);res.append(d)
    if len(S)<10: print("# ICP: yetersiz eşleşme"); break
    Ax=fit_affine(S,Dx);Ay=fit_affine(S,Dy)
    def tf(E,N,Ax=Ax,Ay=Ay): return (Ax[0]*E+Ax[1]*N+Ax[2], Ay[0]*E+Ay[1]*N+Ay[2])
    import statistics
    print(f"# ICP it{it}: eşleşen={len(S)} medyan={statistics.median(res):.0f}m max={max(res):.0f}m")

# nihai transform tf. metre->WGS84 geri
def m_to_lon(x): return x/(R*D2R*math.cos(lat0))
def m_to_lat(y): return y/(R*D2R)
def utm_ll(E,N): x,y=tf(E,N); return (m_to_lat(y),m_to_lon(x))

# HAT1 merkez hattı WGS84 + arc uzunluk
center=[utm_ll(E,N) for E,N in poly_utm]
arc=[0.0]
for i in range(1,len(center)):
    arc.append(arc[-1]+dm(center[i-1][1],center[i-1][0],center[i][1],center[i][0]))
print(f"# HAT1 WGS84 arc uzunluk: {arc[-1]:.0f}m")

# --- etap1 istasyonları: HAT1 = Aslım(0) -> Şehir Hastanesi(10833); Adliye ayrı ~900m kol ---
E1=["Aslım Sanayi","Ravza Camii","Gülistan Caddesi","Motorlu Taşıtlar Sanayisi","Büsan Sanayi","Hüdai","Sedirler Kavşağı","Depo","Şehir Parkı","Ereğli Kavşağı","Rezerv İstasyonu","Şehir Hastanesi","Adliye (Lise/Okullar)"]
MES=[1344,1232,787,1444,459,767,1050,1008,1068,637,1037,900]
chain=[0]
for d in MES: chain.append(chain[-1]+d)
total_hat1=chain[11]  # Aslım..Şehir Hastanesi = 10833 (Adliye kolu hariç)
# HAT1 hangi ucu Şehir Hastanesi (OSM 37.8557,32.5499)? center[0] vs center[-1]
d0_sh=dm(center[0][1],center[0][0],32.5499,37.8557); dN_sh=dm(center[-1][1],center[-1][0],32.5499,37.8557)
sh_at_start = d0_sh < dN_sh
print(f"# center[0] ŞehirHast'e {d0_sh:.0f}m, center[-1] {dN_sh:.0f}m -> ŞehirHast {'BAŞ(arc0)' if sh_at_start else 'SON'}")
import bisect
def pos_on_arc(a):
    a=max(0,min(arc[-1],a))
    i=bisect.bisect_left(arc,a); i=max(1,min(i,len(arc)-1))
    t=(a-arc[i-1])/max(1e-9,(arc[i]-arc[i-1]))
    return (center[i-1][0]+t*(center[i][0]-center[i-1][0]), center[i-1][1]+t*(center[i][1]-center[i-1][1]))
def pos_at(chain_m):
    frac=chain_m/total_hat1   # 0=Aslım, 1=ŞehirHast
    a = (arc[-1]*(1-frac)) if sh_at_start else (arc[-1]*frac)  # ŞehirHast arc0 ise Aslım=arc[-1]
    return pos_on_arc(a)
# OSM inşaat koridoruna snap (gerçek hatta otur) — 150m cap
osm_ll=[(la,lo) for w in osm_ins for la,lo in w["noktalar"]]
def snap(la,lo):
    best=None;bd=1e18
    for oa,ob in osm_ll:
        d=dm(lo,la,ob,oa)
        if d<bd: bd=d;best=(oa,ob)
    return (best, bd) if bd<=150 else ((la,lo),bd)

out={}
print("\n=== ETAP1 istasyon konumları (HAT1 + kilometraj, OSM-snap) ===")
osm_ist=json.load(open(SP+"/osm_ist.json", encoding="utf-8"))
def norm(s):
    import re; s=s.lower().replace("ı","i").replace("İ","i").replace("ş","s").replace("ğ","g").replace("ü","u").replace("ö","o").replace("ç","c"); return re.sub(r"[^a-z0-9]","",s)
osm_map={norm(x["ad"]):x for x in osm_ist}
for i,nm in enumerate(E1):
    if nm.startswith("Adliye"):
        v=osm_map.get("adliye"); la,lo=(v["lat"],v["lon"]) if v else pos_at(chain[i]); snapd=0
        print(f"  {nm:26} ({la},{lo}) [OSM Adliye doğrudan]")
    else:
        pla,plo=pos_at(chain[i]); (sa,so),snapd=snap(pla,plo); la,lo=round(sa,5),round(so,5)
        chk=""
        key=norm(nm.split("(")[0])
        for k,v in osm_map.items():
            if key and (key in k or k in key) and len(key)>=5:
                chk=f"  OSMçapa[{v['ad'][:20]}]={dm(lo,la,v['lon'],v['lat']):.0f}m"; break
        print(f"  {nm:26} ({la},{lo}) km={chain[i]} snap={snapd:.0f}m{chk}")
    out[nm]={"lat":round(la,5),"lon":round(lo,5)}

json.dump(out,open(SP+"/etap1_coords.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print(f"\n# yazıldı: etap1_coords.json")

# SHAPE (GTFS shapes.txt için): HAT1 merkez hattı WGS84, Aslım(0) -> Şehir Hastanesi ucu,
# sonra Adliye kolu eklenir (13 istasyonu kapsar). Import bunu gerçek kavisli hiza +
# gerçek mesafe + kavis çıkarımı için kullanır.
shape = center[::-1] if sh_at_start else center[:]   # Aslım başta
shape_out = [[round(la, 6), round(lo, 6)] for la, lo in shape]
adl = out["Adliye (Lise/Okullar)"]
shape_out.append([adl["lat"], adl["lon"]])
json.dump(shape_out, open(SP + "/etap1_shape.json", "w", encoding="utf-8"))
print(f"# yazıldı: etap1_shape.json ({len(shape_out)} nokta)")
