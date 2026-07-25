// GEÇİCİ TEŞHİS — iyzico anahtar şeklini raporlar (değeri sızdırmaz). Sonra sil.
import { iyzicoTeshis } from "@/lib/iyzico";

export async function GET() {
  return Response.json(iyzicoTeshis());
}
