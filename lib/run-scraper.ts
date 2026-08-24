import { isEventimUrl, scrapeEventim } from "@/lib/eventim-scraper";
import type { ScrapedEvent } from "@/lib/scraped-event";
import { updateScraper, type Scraper } from "@/lib/scrapers";

type RunPayload = {
  events: ScrapedEvent[];
  warning: string | null;
  error: string | null;
};

export async function runScraper(scraper: Scraper): Promise<Scraper | null> {
  const result = await scrapeWithFallback(scraper.url);
  return updateScraper(scraper.id, {
    events: result.events,
    entryCount: result.events.length,
    lastRunAt: new Date().toISOString(),
    error: result.events.length > 0 ? null : result.error ?? result.warning,
  });
}

async function scrapeWithFallback(url: string): Promise<RunPayload> {
  if (typeof window !== "undefined" && isEventimUrl(url)) {
    try {
      const result = await scrapeEventim(url);
      if (result.events.length > 0) {
        return { ...result, error: null };
      }
      const server = await scrapeViaApi(url);
      if (server.events.length > 0) return server;
      return {
        events: [],
        warning: server.warning ?? result.warning,
        error: server.error,
      };
    } catch (error) {
      const server = await scrapeViaApi(url);
      if (server.events.length > 0) return server;
      if (server.error || server.warning) return server;
      return {
        events: [],
        warning: null,
        error:
          error instanceof Error ? error.message : "Scraping fehlgeschlagen.",
      };
    }
  }

  return scrapeViaApi(url);
}

async function scrapeViaApi(url: string): Promise<RunPayload> {
  try {
    const response = await fetch("/api/scraper/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const payload = (await response.json()) as {
      events?: ScrapedEvent[];
      warning?: string | null;
      error?: string | null;
    };
    return {
      events: payload.events ?? [],
      warning: payload.warning ?? null,
      error: payload.error ?? null,
    };
  } catch (err) {
    return {
      events: [],
      warning: null,
      error: err instanceof Error ? err.message : "Scraping fehlgeschlagen.",
    };
  }
}
