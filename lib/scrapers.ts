import {
  isFollowUpGroup,
  type FollowUpGroup,
} from "@/lib/follow-up";
import {
  eventKey,
  SCRAPER_FIELDS,
  type ScrapedEvent,
  type ScraperField,
} from "@/lib/scraped-event";

export type { ScraperField };

export type ScraperSelection = {
  selectAll: boolean;
  itemIds: string[];
  fields: ScraperField[];
};

export type ScraperFollowUp = {
  running: boolean;
  groups: FollowUpGroup[];
};

export type Scraper = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  preview: ScrapedEvent[];
  selection: ScraperSelection;
  events: ScrapedEvent[];
  entryCount: number;
  lastRunAt: string | null;
  error: string | null;
  warning: string | null;
  followUp: ScraperFollowUp | null;
};

const STORAGE_KEY = "eventscraper.scrapers";
const UPDATED_EVENT = "eventscraper-updated";

export function defaultSelection(): ScraperSelection {
  return {
    selectAll: false,
    itemIds: [],
    fields: [...SCRAPER_FIELDS],
  };
}

export function newScraper(name: string, url: string): Scraper {
  return {
    id: createId(),
    name,
    url,
    createdAt: new Date().toISOString(),
    preview: [],
    selection: defaultSelection(),
    events: [],
    entryCount: 0,
    lastRunAt: null,
    error: null,
    warning: null,
    followUp: null,
  };
}

export function loadScrapers(): Scraper[] {
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

export function saveScrapers(scrapers: Scraper[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scrapers));
  window.dispatchEvent(new Event(UPDATED_EVENT));
}

export function getScraper(id: string): Scraper | null {
  return loadScrapers().find((item) => item.id === id) ?? null;
}

export function updateScraper(
  id: string,
  patch: Partial<Omit<Scraper, "id">>
): Scraper | null {
  const scrapers = loadScrapers();
  const index = scrapers.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const next = withDefaults({ ...scrapers[index], ...patch });
  scrapers[index] = next;
  saveScrapers(scrapers);
  return next;
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function applySelection(
  preview: ScrapedEvent[],
  selection: ScraperSelection
): ScrapedEvent[] {
  const fields = normalizeFields(selection.fields);
  const items = selection.selectAll
    ? preview
    : preview.filter((event) => selection.itemIds.includes(eventKey(event)));
  return items.map((event) => pickFields(event, fields));
}

export function selectionForRerun(selection: ScraperSelection): ScraperSelection {
  if (!selection.selectAll && selection.itemIds.length === 0) {
    return { ...selection, selectAll: true, fields: normalizeFields(selection.fields) };
  }
  return { ...selection, fields: normalizeFields(selection.fields) };
}

function pickFields(event: ScrapedEvent, fields: ScraperField[]): ScrapedEvent {
  const keep = new Set(fields);
  return {
    name: keep.has("name") ? event.name : "",
    venue: keep.has("location") ? event.venue : null,
    city: keep.has("location") ? event.city : null,
    location: keep.has("location") ? event.location : null,
    date: keep.has("date") ? event.date : null,
    time: keep.has("time") ? event.time : null,
    startsAt: event.startsAt,
    heroImage: keep.has("heroImage") ? event.heroImage : null,
    ticketUrl: keep.has("ticketUrl") ? event.ticketUrl : null,
    price: keep.has("price") ? event.price : null,
    productGroupId: event.productGroupId,
  };
}

function normalizeFields(fields: ScraperField[]): ScraperField[] {
  const allowed = new Set<string>(SCRAPER_FIELDS);
  const next = fields.filter((field) => allowed.has(field));
  return next.length > 0 ? next : [...SCRAPER_FIELDS];
}

function withDefaults(row: Scraper): Scraper {
  const events = Array.isArray(row.events) ? row.events.filter(isEvent) : [];
  const preview = Array.isArray(row.preview) ? row.preview.filter(isEvent) : [];
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    createdAt: row.createdAt,
    preview,
    selection: normalizeStoredSelection(row.selection),
    events,
    entryCount: typeof row.entryCount === "number" ? row.entryCount : events.length,
    lastRunAt: row.lastRunAt ?? null,
    error: typeof row.error === "string" ? row.error : null,
    warning: typeof row.warning === "string" ? row.warning : null,
    followUp: normalizeFollowUp(row.followUp),
  };
}

function normalizeFollowUp(value: unknown): ScraperFollowUp | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ScraperFollowUp>;
  const groups = Array.isArray(row.groups)
    ? row.groups.filter(isFollowUpGroup)
    : [];
  if (groups.length === 0) return null;
  return {
    running: row.running === true,
    groups,
  };
}

function normalizeStoredSelection(value: unknown): ScraperSelection {
  const fallback = defaultSelection();
  if (!value || typeof value !== "object") return fallback;
  const row = value as Partial<ScraperSelection>;
  return {
    selectAll: row.selectAll === true,
    itemIds: Array.isArray(row.itemIds)
      ? row.itemIds.filter((item): item is string => typeof item === "string")
      : [],
    fields: normalizeFields(
      Array.isArray(row.fields) ? (row.fields as ScraperField[]) : fallback.fields
    ),
  };
}

function isScraper(value: unknown): value is Scraper {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.url === "string" &&
    typeof row.createdAt === "string"
  );
}

function isEvent(value: unknown): value is ScrapedEvent {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).name === "string";
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
