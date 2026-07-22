import { AnklasmanSim } from "@/components/AnklasmanSim";

export default async function AnklasmanPage({
  searchParams,
}: {
  searchParams: Promise<{ bolge?: string }>;
}) {
  const { bolge } = await searchParams;
  return <AnklasmanSim initialBolgeId={bolge} />;
}
