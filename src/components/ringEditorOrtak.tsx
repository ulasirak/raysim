"use client";
// raysim — RingEditor & RingKart PAYLAŞILAN küçük yardımcılar (dosya bölme).
import { type ReactNode } from "react";
import { CK } from "@/lib/anaray/chartkit";
import { brand } from "@/lib/anaray/brand";

export const KMH = 1 / 3.6;
export const OK = CK.good;

/** Bir alanın altına çok kısa, basit açıklama (kullanıcı anlasın diye). */
export function Kucuk({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-snug" style={{ color: brand.muted }}>{children}</p>;
}
