import { isEventimUrl, scrapeEventim } from "@/lib/eventim-scraper";
import type { ScrapedEvent } from "@/lib/scraped-event";
import {
  applySelection,
  selectionForRerun,
  updateScraper,
  type Scraper,
  type ScraperSelection,
} from "@/lib/scrapers";

type RunPayload = {
  events: ScrapedEvent[];
  warning: string | null;
  error: string | null;
};

export async function loadScraperPreview(scraper: Scraper): Promise<Scraper | null> {
  const result = await scrapeWithFallback(scraper.url);
  const firstLoad = scraper.preview.length === 0;
  return updateScraper(scraper.id, {
    preview: result.events,
    ...(firstLoad ? { events: [], entryCount: 0 } : {}),
    lastRunAt: new Date().toISOString(),
    error: result.events.length > 0 ? null : result.error,
    warning: result.warning,
  });
}

export async function runScraper(scraper: Scraper): Promise<Scraper | null> {
  const result = await scrapeWithFallback(scraper.url);
  const selection = selectionForRerun(scraper.selection);
  const events = applySelection(result.events, selection);
  return updateScraper(scraper.id, {
    preview: result.events,
    selection,
    events,
    entryCount: events.length,
    lastRunAt: new Date().toISOString(),
    error: result.events.length > 0 ? null : result.error,
    warning: result.warning,
  });
}

export function applyScraperSelection(
  scraper: Scraper,
  selection: ScraperSelection
): Scraper | null {
  const events = applySelection(scraper.preview, selection);
  return updateScraper(scraper.id, {
    selection,
    events,
    entryCount: events.length,
    error:
      scraper.preview.length === 0
        ? scraper.error
        : events.length > 0
          ? null
          : "Bitte mindestens ein Event anklicken.",
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
