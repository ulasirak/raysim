// raysim — KARE paylaşım görseli (WhatsApp/Twitter/OG link önizlemesi).
// 1200×1200 mühür kompozisyonu: amblem + RaySim kelime markası + alt başlık.
import { ImageResponse } from "next/og";
import { emblemDataUri } from "@/lib/emblem";

export const alt = "RaySim — Demiryolu Ağı Simülasyon Sistemi";
export const size = { width: 1200, height: 1200 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0C2233",
          position: "relative",
        }}
      >
        {/* üst cetvel — resmî kırmızı */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 16, background: "#C8102E", display: "flex" }} />

        {/* amblem — ImageResponse (Satori) içinde next/image render edilmez; <img> zorunlu. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={600} height={600} src={emblemDataUri()} alt="RaySim amblemi" style={{ marginBottom: 24 }} />

        {/* kelime markası */}
        <div style={{ fontSize: 180, color: "#FFFFFF", fontWeight: 600, letterSpacing: 6, display: "flex" }}>
          RaySim
        </div>

        {/* alt başlık */}
        <div
          style={{
            marginTop: 20,
            fontSize: 38,
            color: "#9AB0C4",
            letterSpacing: 14,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          Demiryolu Ağı Simülasyon
        </div>

        {/* alt cetvel — mühür gold */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 16, background: "#A8842C", display: "flex" }} />
      </div>
    ),
    { ...size }
  );
}
