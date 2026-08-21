export type EventScraper = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  selectedFields: string[];
};

const STORAGE_KEY = "eventscraper.scrapers";

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
  return {
    ...row,
    selectedFields: Array.isArray(row.selectedFields) ? row.selectedFields : [],
  };
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
  const next = { ...scrapers[index], ...patch };
  scrapers[index] = next;
  saveScrapers(scrapers);
  return next;
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
