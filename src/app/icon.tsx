// raysim — favicon / uygulama ikonu: kare amblem mührü (koyu mürekkep zemin).
import { ImageResponse } from "next/og";
import { emblemDataUri } from "@/lib/emblem";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0C2233",
        }}
      >
        {/* ImageResponse (Satori) — next/image render edilmez; <img> zorunlu. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={56} height={56} src={emblemDataUri()} alt="RaySim amblemi" />
      </div>
    ),
    { ...size }
  );
}
