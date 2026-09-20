#!/usr/bin/env python3
# raysim — güzergah DXF'inden İSTASYON konumlarını (CAD XY) çıkar.
#   scan <dxf>            : TEXT/MTEXT içerikleri + INSERT blok adları + istasyon-benzeri
#                           katmanları konumlarıyla listele (station tespiti).
#   layers <dxf>          : tüm katman adlarını entity sayısıyla listele.
import sys, math, collections, re, json
from ezdxf.addons import iterdxf

STA_RE = re.compile(r"stasyon|İSTASYON|ISTASYON|station|peron|durak|ALAADD|MEVLAN|FETIH|HUKUM|HÜKÜM|KARSEHIR|KARŞEHIR|ADLIYE|KONGRE|SPOR|KULTUR|KÜLTÜR", re.IGNORECASE)


def _xy(e):
    t = e.dxftype()
    try:
        if t in ("TEXT",):
            p = e.dxf.insert; return (float(p[0]), float(p[1]))
        if t == "MTEXT":
            p = e.dxf.insert; return (float(p[0]), float(p[1]))
        if t == "INSERT":
            p = e.dxf.insert; return (float(p[0]), float(p[1]))
    except Exception:
        return None
    return None


def scan(path):
    doc = iterdxf.opendxf(path)
    texts = []      # (layer, text, x, y)
    inserts = collections.Counter()
    insert_pos = collections.defaultdict(list)
    lay_pts = collections.defaultdict(list)  # layer -> [(x,y)]
    try:
        for e in doc.modelspace():
            t = e.dxftype()
            lay = getattr(e.dxf, "layer", "?")
            xy = _xy(e)
            if t in ("TEXT", "MTEXT"):
                try:
                    s = e.dxf.text if t == "TEXT" else e.text
                except Exception:
                    s = ""
                s = (s or "").strip().replace("\n", " ")[:60]
                if xy and s:
                    texts.append((lay, s, xy[0], xy[1]))
            elif t == "INSERT":
                nm = getattr(e.dxf, "name", "?")
                inserts[nm] += 1
                if xy:
                    insert_pos[nm].append(xy)
            if xy and STA_RE.search(lay or ""):
                lay_pts[lay].append(xy)
    finally:
        doc.close()

    print("### İSTASYON-benzeri TEXT/MTEXT (içerik eşleşen):")
    hit = [x for x in texts if STA_RE.search(x[1])]
    for lay, s, x, y in hit[:60]:
        print(f"  [{lay}] {s!r} @ ({x:.1f},{y:.1f})")
    print(f"  (toplam eşleşen text: {len(hit)} / {len(texts)})")

    print("\n### INSERT blok adları (en sık 30):")
    for nm, c in inserts.most_common(30):
        ps = insert_pos.get(nm, [])
        ex = ps[0] if ps else None
        print(f"  {nm!r} x{c}" + (f"  örn@({ex[0]:.1f},{ex[1]:.1f})" if ex else ""))

    print("\n### İstasyon-benzeri KATMAN centroidleri:")
    for lay, pts in sorted(lay_pts.items()):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        print(f"  [{lay}] n={len(pts)} centroid=({cx:.1f},{cy:.1f})")


def layers(path):
    doc = iterdxf.opendxf(path)
    c = collections.Counter()
    try:
        for e in doc.modelspace():
            c[getattr(e.dxf, "layer", "?")] += 1
    finally:
        doc.close()
    for lay, n in c.most_common(120):
        print(f"  {lay!r}: {n}")


def _strip_mtext(s):
    # MTEXT format kodlarını ({\fArial|..;METIN}, \P, vs.) temizle
    s = re.sub(r"\{\\[^;]*;", "", s)
    s = s.replace("}", "").replace("\\P", " ")
    s = re.sub(r"\\[A-Za-z][^\\;]*;?", "", s)
    return s.strip()


def dump(path, out):
    # "STASYON" içeren tüm TEXT/MTEXT'leri koordinatıyla JSON'a yaz (Signalling_aa şematik hariç).
    doc = iterdxf.opendxf(path)
    rows = []
    try:
        for e in doc.modelspace():
            t = e.dxftype()
            if t not in ("TEXT", "MTEXT"):
                continue
            lay = getattr(e.dxf, "layer", "?")
            if lay == "Signalling_aa":
                continue  # şematik sinyal diyagramı — geografik değil
            try:
                s = e.dxf.text if t == "TEXT" else e.text
            except Exception:
                s = ""
            s = _strip_mtext(s or "").replace("\n", " ").strip()
            if "STASYON" not in s.upper():
                continue
            xy = _xy(e)
            if not xy:
                continue
            rows.append({"layer": lay, "text": s[:80], "x": round(xy[0], 2), "y": round(xy[1], 2)})
    finally:
        doc.close()
    json.dump(rows, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"# {out}: {len(rows)} istasyon-etiketi")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "dump":
        dump(sys.argv[2], sys.argv[3])
    elif cmd == "inserts":
        # INSERT konumlarını blok-adı alt-dizesine göre JSON'a yaz (alignment tick / centerline).
        sub = sys.argv[3]
        out = sys.argv[4] if len(sys.argv) > 4 else None
        doc = iterdxf.opendxf(sys.argv[2])
        pts = []
        try:
            for e in doc.modelspace():
                if e.dxftype() != "INSERT":
                    continue
                nm = getattr(e.dxf, "name", "")
                if sub not in nm:
                    continue
                p = e.dxf.insert
                pts.append([round(float(p[0]), 2), round(float(p[1]), 2)])
        finally:
            doc.close()
        print(f"# {sub!r}: {len(pts)} insert")
        if out:
            json.dump(pts, open(out, "w"), ensure_ascii=False)
            print(f"# yazıldı {out}")
        else:
            print(pts[:10])
    elif cmd == "find":
        pat = re.compile(sys.argv[3], re.IGNORECASE)
        doc = iterdxf.opendxf(sys.argv[2])
        seen = collections.Counter()
        try:
            for e in doc.modelspace():
                if e.dxftype() not in ("TEXT", "MTEXT"):
                    continue
                try:
                    s = e.dxf.text if e.dxftype() == "TEXT" else e.text
                except Exception:
                    s = ""
                s = _strip_mtext(s or "").replace("\n", " ").strip()
                if not s or not pat.search(s):
                    continue
                lay = getattr(e.dxf, "layer", "?")
                xy = _xy(e)
                keyv = (lay, s[:40])
                if seen[keyv] >= 2:
                    continue
                seen[keyv] += 1
                print(f"  [{lay}] {s[:50]!r} @ ({xy[0]:.1f},{xy[1]:.1f})" if xy else f"  [{lay}] {s[:50]!r} (konum yok)")
        finally:
            doc.close()
    else:
        {"scan": scan, "layers": layers}[cmd](sys.argv[2])
