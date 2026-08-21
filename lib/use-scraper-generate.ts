"use client";

import { useState } from "react";

import { scrapeEventsFromUrl } from "@/lib/event-scraper-run";
import {
  updateScraperSource,
  type EventScraper,
  type ScraperSource,
} from "@/lib/event-scrapers";

export function useScraperGenerate() {
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const generateSource = async (
    scraperId: string,
    source: ScraperSource
  ): Promise<EventScraper | null> => {
    setGeneratingId(source.id);
    try {
      const result = await scrapeEventsFromUrl(source.url);
      return updateScraperSource(scraperId, source.id, {
        events: result.events,
        entryCount: result.events.length,
        lastScrapedAt: new Date().toISOString(),
        error: result.error,
      });
    } finally {
      setGeneratingId(null);
    }
  };

  const generateAll = async (
    scraper: EventScraper
  ): Promise<EventScraper | null> => {
    let current: EventScraper | null = scraper;
    for (const source of scraper.sources) {
      const next = await generateSource(scraper.id, source);
      if (next) current = next;
    }
    return current;
  };

  return { generatingId, generateSource, generateAll };
}
