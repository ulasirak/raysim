#!/usr/bin/env python3
# raysim — Konya DXF'ten ana hat KURP (kavis) yarıçabı çıkarma aracı.
#
#   census <dxf>           : ARC taşıyan katmanları tram-aralığı (R 40-1500) yarıçap
#                            sayısına göre listele → doğru HİZALAMA katmanını bul.
#   extract <dxf> <layer> [out.json]
#                          : verilen katmandan ARC + polyline bulge yaylarını yarıçaba
#                            çevir; sürekli hizalamayı kur, kilometraj boyunca kurpları
#                            (kmMerkez, uzunluk, yaricap) JSON olarak yaz.
#
# Büyük dosya için streaming (ezdxf.addons.iterdxf) — düşük bellek.
# NOT: Tramvay ekseni Civil3D alignment (proxy) ise plain ARC/LINE olarak GÖRÜNMEZ;
# önce AutoCAD'de (accoreconsole EXPLODE) düz geometriye çevrilmeli ya da doğru
# eksen katmanı adı verilmeli. census çıktısı adayları gösterir.
import sys, json, math, collections
from ezdxf.addons import iterdxf


def _bulge_r(p1, p2, b):
    c = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    if c < 1e-9 or abs(b) < 1e-6:
        return None
    return c * (1 + b * b) / (4 * abs(b))


def census(path):
    doc = iterdxf.opendxf(path)
    R = collections.defaultdict(list)
    try:
        for e in doc.modelspace():
            if e.dxftype() == "ARC":
                R[getattr(e.dxf, "layer", "?")].append(float(e.dxf.radius))
    finally:
        doc.close()
    tram = lambda rs: sum(1 for r in rs if 40 <= r <= 1500)
    print("# ARC taşıyan katmanlar — tram-aralığı (R 40-1500) yarıçap sayısına göre:")
    for lay in sorted(R, key=lambda l: tram(R[l]), reverse=True)[:30]:
        rs = sorted(R[lay])
        print(f"  {lay!r}: ARC={len(rs)} tramR={tram(rs)} min={rs[0]:.0f} med={rs[len(rs)//2]:.0f} max={rs[-1]:.0f}")


def extract(path, layer, out=None):
    doc = iterdxf.opendxf(path)
    kurplar = []  # (x, y, R)  — yay merkezleri + yarıçap (kilometraj eşlemesi ayrı adım)
    try:
        for e in doc.modelspace():
            if getattr(e.dxf, "layer", None) != layer:
                continue
            t = e.dxftype()
            if t == "ARC":
                c = e.dxf.center
                kurplar.append((float(c[0]), float(c[1]), float(e.dxf.radius)))
            elif t in ("LWPOLYLINE", "POLYLINE"):
                try:
                    pts = list(e.get_points("xyb")) if t == "LWPOLYLINE" else \
                        [(v.dxf.location[0], v.dxf.location[1], getattr(v.dxf, "bulge", 0.0)) for v in e.vertices]
                except Exception:
                    pts = []
                for i in range(len(pts) - 1):
                    b = pts[i][2] if len(pts[i]) > 2 else 0.0
                    r = _bulge_r(pts[i], pts[i + 1], b)
                    if r:
                        mx = (pts[i][0] + pts[i + 1][0]) / 2
                        my = (pts[i][1] + pts[i + 1][1]) / 2
                        kurplar.append((mx, my, r))
    finally:
        doc.close()
    tram = [k for k in kurplar if 20 <= k[2] <= 2000]
    print(f"# {layer!r}: {len(kurplar)} yay, tram-aralığı {len(tram)}")
    data = [{"x": round(x, 3), "y": round(y, 3), "yaricap": round(r, 1)} for x, y, r in tram]
    if out:
        json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"# yazıldı: {out} ({len(data)} kurp)")
    else:
        print(json.dumps(data[:20], ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "census":
        census(sys.argv[2])
    elif cmd == "extract":
        extract(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    else:
        print("bilinmeyen komut:", cmd); sys.exit(1)
