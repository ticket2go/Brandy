import ScraperDetail from "@/components/ScraperDetail";

type ScraperDetailPageProps = {
  params: { id: string };
};

export default function ScraperDetailPage({ params }: ScraperDetailPageProps) {
  return <ScraperDetail id={params.id} />;
}
