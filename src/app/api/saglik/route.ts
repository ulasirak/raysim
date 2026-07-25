// raysim — GEÇİCİ TEŞHİS. 500 hatasının kaynağını bulmak için. Sebep bulununca SİL.
// firebase-admin'i yalnız try içinde DİNAMİK import eder → bu route asla 500 vermez;
// import patlarsa hatayı JSON olarak raporlar. Hiçbir secret sızdırmaz.

export async function GET() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  let jsonOk = false;
  let jsonHata = "";
  if (sa) {
    try {
      const p = JSON.parse(sa);
      jsonOk = Boolean(p.project_id && p.client_email && p.private_key);
      if (!jsonOk) jsonHata = "JSON geçerli ama project_id/client_email/private_key eksik";
    } catch (e) {
      jsonHata = "JSON.parse başarısız: " + (e instanceof Error ? e.message : String(e));
    }
  }

  let adminYuklendi = false;
  let adminHata = "";
  try {
    await import("firebase-admin/app");
    adminYuklendi = true;
  } catch (e) {
    adminHata = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  return Response.json({
    saVar: Boolean(sa),
    saUzunluk: sa?.length ?? 0,
    saBas: sa ? sa.slice(0, 1) : "",      // "{" bekleniyor; başka bir şeyse yanlış girilmiş
    jsonOk,
    jsonHata,
    iyzicoVar: Boolean(process.env.IYZICO_API_KEY),
    iyzicoBase: process.env.IYZICO_BASE_URL ?? null,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    adminYuklendi,
    adminHata,
  });
}
