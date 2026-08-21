import EventscraperDetail from "@/components/EventscraperDetail";

type EventscraperDetailPageProps = {
  params: { id: string };
};

export default function EventscraperDetailPage({
  params,
}: EventscraperDetailPageProps) {
  return <EventscraperDetail id={params.id} />;
}
