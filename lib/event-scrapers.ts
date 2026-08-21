import type { EventimEvent } from "@/lib/eventim";

export type ScraperSource = {
  id: string;
  url: string;
  entryCount: number;
  lastScrapedAt: string | null;
  events: EventimEvent[];
  error: string | null;
};

export type EventScraper = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  selectedFields: string[];
  sources: ScraperSource[];
};

const STORAGE_KEY = "eventscraper.scrapers";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isEvent(value: unknown): value is EventimEvent {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.name === "string";
}

function withEventDefaults(row: EventimEvent): EventimEvent {
  const cities = Array.isArray(row.cities)
    ? row.cities.filter((item): item is string => typeof item === "string")
    : row.city
      ? [row.city]
      : [];
  return {
    name: row.name,
    date: row.date ?? null,
    image: row.image ?? row.heroImage ?? null,
    heroImage: row.heroImage ?? row.image ?? null,
    location: row.location ?? null,
    venue: row.venue ?? null,
    city: row.city ?? cities[0] ?? null,
    cities,
    url: row.url ?? null,
    productGroupId: row.productGroupId ?? null,
  };
}

function isSource(value: unknown): value is ScraperSource {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.url === "string";
}

function withSourceDefaults(row: ScraperSource): ScraperSource {
  return {
    id: row.id,
    url: row.url,
    entryCount: typeof row.entryCount === "number" ? row.entryCount : 0,
    lastScrapedAt: row.lastScrapedAt ?? null,
    events: Array.isArray(row.events)
      ? row.events.filter(isEvent).map(withEventDefaults)
      : [],
    error: typeof row.error === "string" ? row.error : null,
  };
}

function createSource(url: string): ScraperSource {
  return {
    id: createId(),
    url,
    entryCount: 0,
    lastScrapedAt: null,
    events: [],
    error: null,
  };
}

function isScraper(value: unknown): value is EventScraper {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const fieldsOk =
    row.selectedFields === undefined ||
    (Array.isArray(row.selectedFields) &&
      row.selectedFields.every((item) => typeof item === "string"));
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.url === "string" &&
    typeof row.createdAt === "string" &&
    fieldsOk
  );
}

function withDefaults(row: EventScraper): EventScraper {
  const rawSources = Array.isArray(row.sources)
    ? row.sources.filter(isSource).map(withSourceDefaults)
    : [];
  const sources =
    rawSources.length > 0 ? rawSources : [createSource(row.url)];
  return {
    ...row,
    selectedFields: Array.isArray(row.selectedFields) ? row.selectedFields : [],
    url: sources[0]?.url ?? row.url,
    sources,
  };
}

export function newScraperId(): string {
  return createId();
}

export function newScraperSource(url: string): ScraperSource {
  return createSource(url);
}

export function scraperEntryCount(scraper: EventScraper): number {
  return scraper.sources.reduce((sum, source) => sum + source.entryCount, 0);
}

export function loadScrapers(): EventScraper[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isScraper).map(withDefaults);
  } catch {
    return [];
  }
}

export function saveScrapers(scrapers: EventScraper[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scrapers));
  window.dispatchEvent(new Event("eventscraper-updated"));
}

export function getScraper(id: string): EventScraper | null {
  return loadScrapers().find((item) => item.id === id) ?? null;
}

export function updateScraper(
  id: string,
  patch: Partial<Omit<EventScraper, "id">>
): EventScraper | null {
  const scrapers = loadScrapers();
  const index = scrapers.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const next = withDefaults({ ...scrapers[index], ...patch });
  scrapers[index] = next;
  saveScrapers(scrapers);
  return next;
}

export function addScraperSource(
  scraperId: string,
  url: string
): EventScraper | null {
  const scraper = getScraper(scraperId);
  if (!scraper) return null;
  const exists = scraper.sources.some((source) => source.url === url);
  if (exists) return scraper;
  return updateScraper(scraperId, {
    sources: [...scraper.sources, createSource(url)],
  });
}

export function removeScraperSource(
  scraperId: string,
  sourceId: string
): EventScraper | null {
  const scraper = getScraper(scraperId);
  if (!scraper || scraper.sources.length <= 1) return scraper;
  const sources = scraper.sources.filter((source) => source.id !== sourceId);
  return updateScraper(scraperId, {
    sources,
    url: sources[0]?.url ?? scraper.url,
  });
}

export function updateScraperSource(
  scraperId: string,
  sourceId: string,
  patch: Partial<Omit<ScraperSource, "id">>
): EventScraper | null {
  const scraper = getScraper(scraperId);
  if (!scraper) return null;
  const sources = scraper.sources.map((source) =>
    source.id === sourceId ? { ...source, ...patch } : source
  );
  return updateScraper(scraperId, {
    sources,
    url: sources[0]?.url ?? scraper.url,
  });
}

export function normalizeScraperUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
