import { fetchEventimEvents, isEventimUrl, type EventimEvent } from "@/lib/eventim";

export type ScrapeRunResult = {
  events: EventimEvent[];
  warning: string | null;
  error: string | null;
};

export async function scrapeEventsFromUrl(
  url: string
): Promise<ScrapeRunResult> {
  let events: EventimEvent[] = [];
  let warning: string | null = null;
  let error: string | null = null;

  try {
    const response = await fetch("/api/eventscraper/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const payload = (await response.json()) as {
      events?: EventimEvent[];
      warning?: string | null;
      error?: string;
    };
    events = payload.events ?? [];
    warning = payload.warning ?? null;
    if (!response.ok && events.length === 0) {
      error = payload.error ?? "Scraping fehlgeschlagen.";
    }
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Scraping fehlgeschlagen.";
  }

  if (isEventimUrl(url) && events.length === 0) {
    try {
      events = await fetchEventimEvents(url);
      if (events.length > 0) {
        warning = null;
        error = null;
      }
    } catch (err) {
      if (!error) {
        error =
          err instanceof Error
            ? err.message
            : "Eventim-Eventdaten konnten nicht geladen werden.";
      }
    }
  }

  return { events, warning, error };
}
