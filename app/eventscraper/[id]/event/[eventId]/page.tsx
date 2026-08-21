import EventscraperEventDetail from "@/components/EventscraperEventDetail";

type EventscraperEventPageProps = {
  params: { id: string; eventId: string };
};

export default function EventscraperEventPage({
  params,
}: EventscraperEventPageProps) {
  return (
    <EventscraperEventDetail
      scraperId={params.id}
      eventId={decodeURIComponent(params.eventId)}
    />
  );
}
