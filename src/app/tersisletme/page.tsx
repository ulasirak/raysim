import { redirect } from "next/navigation";

// "Ters İşletme" ayrı bir modül DEĞİL — Sefer Simülasyonu içinde (Studio ② Canlı Sim)
// render edilir. Bu eski/yetim rota yalnız geriye dönük link uyumluluğu için durur ve
// kullanıcıyı Sefer bölümüne yönlendirir (mükerrer bağımsız sayfa kaldırıldı).
export default function TersIsletmePage() {
  redirect("/#sefer");
}
