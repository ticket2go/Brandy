import type { ScrapedEvent } from "@/lib/scraped-event";
import { updateScraper, type Scraper } from "@/lib/scrapers";

export async function runScraper(scraper: Scraper): Promise<Scraper | null> {
  let events: ScrapedEvent[] = [];
  let error: string | null = null;

  try {
    const response = await fetch("/api/scraper/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: scraper.url }),
    });
    const payload = (await response.json()) as {
      events?: ScrapedEvent[];
      warning?: string | null;
      error?: string | null;
    };
    events = payload.events ?? [];
    error = payload.error ?? payload.warning ?? null;
  } catch (err) {
    error = err instanceof Error ? err.message : "Scraping fehlgeschlagen.";
  }

  return updateScraper(scraper.id, {
    events,
    entryCount: events.length,
    lastRunAt: new Date().toISOString(),
    error: events.length > 0 ? null : error,
  });
}
