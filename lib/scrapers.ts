import type { ScraperUpdate } from "@/lib/event-diff";
import {
  normalizeIngest,
  type ScraperIngest,
} from "@/lib/gethyped-ingest";
import {
  isFollowUpGroup,
  type FollowUpGroup,
} from "@/lib/follow-up";
import {
  eventFromRow,
  fetchScraperRows,
  flushScraperPersists,
  isScraperDbAvailable,
  isUuid,
  scheduleScraperPersist,
  deleteScraperRow,
  type ScraperEventRow,
  type ScraperRow,
} from "@/lib/scraper-db";
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
  lastUpdate: ScraperUpdate | null;
  lastIngest: ScraperIngest | null;
};

export type PersistOptions = {
  persistEvents?: boolean;
};

const STORAGE_KEY = "eventscraper.scrapers";
const UPDATED_EVENT = "eventscraper-updated";

let memory: Scraper[] | null = null;
let hydrated = false;
let hydratePromise: Promise<Scraper[]> | null = null;

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
    lastUpdate: null,
    lastIngest: null,
  };
}

export function loadScrapers(): Scraper[] {
  if (typeof window === "undefined") return [];
  if (memory) return memory;
  memory = readLocal();
  return memory;
}

export async function hydrateScrapers(): Promise<Scraper[]> {
  if (typeof window === "undefined") return [];
  if (hydrated && memory) return memory;
  if (hydratePromise) return hydratePromise;
  hydratePromise = doHydrate();
  try {
    return await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export function saveScrapers(scrapers: Scraper[]): void {
  remember(scrapers);
}

export function getScraper(id: string): Scraper | null {
  return loadScrapers().find((item) => item.id === id) ?? null;
}

export function updateScraper(
  id: string,
  patch: Partial<Omit<Scraper, "id">>,
  options?: PersistOptions
): Scraper | null {
  const scrapers = loadScrapers();
  const index = scrapers.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const next = withDefaults({ ...scrapers[index], ...patch });
  scrapers[index] = next;
  remember(scrapers);
  const persistEvents =
    options?.persistEvents ??
    (patch.events !== undefined ||
      (patch.preview !== undefined && next.followUp?.running !== true));
  scheduleScraperPersist(next, { events: persistEvents });
  return next;
}

export async function addScraper(scraper: Scraper): Promise<Scraper> {
  const next = ensureUuidId(scraper);
  const scrapers = loadScrapers();
  if (!scrapers.some((item) => item.id === next.id)) {
    scrapers.push(next);
    remember(scrapers);
  }
  scheduleScraperPersist(next, { events: true });
  await flushScraperPersists();
  return next;
}

export async function removeScraper(id: string): Promise<void> {
  remember(loadScrapers().filter((item) => item.id !== id));
  await deleteScraperRow(id);
}

export async function flushScrapers(): Promise<void> {
  await flushScraperPersists();
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

async function doHydrate(): Promise<Scraper[]> {
  const rows = await fetchScraperRows();
  if (rows) {
    const fromDb = scrapersFromRows(rows.scrapers, rows.events);
    if (fromDb.length === 0) {
      const local = readLocal().map(ensureUuidId);
      memory = local;
      for (const item of local) {
        scheduleScraperPersist(item, { events: true });
      }
      await flushScraperPersists();
      remember(local);
    } else {
      const byId = new Map(fromDb.map((item) => [item.id, item]));
      for (const item of readLocal().map(ensureUuidId)) {
        if (byId.has(item.id)) continue;
        byId.set(item.id, item);
        scheduleScraperPersist(item, { events: true });
      }
      memory = [...byId.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
      await flushScraperPersists();
      remember(memory);
    }
  } else if (!memory) {
    memory = readLocal();
  }
  hydrated = true;
  notify();
  return memory ?? [];
}

function scrapersFromRows(
  scrapers: ScraperRow[],
  events: ScraperEventRow[]
): Scraper[] {
  const eventsById = new Map<string, ScrapedEvent[]>();
  for (const row of events) {
    const list = eventsById.get(row.scraper_id) ?? [];
    list.push(eventFromRow(row));
    eventsById.set(row.scraper_id, list);
  }
  return scrapers.map((row) => {
    const list = eventsById.get(row.id) ?? [];
    return withDefaults({
      id: row.id,
      name: row.name,
      url: row.url,
      createdAt: row.created_at,
      preview: list,
      events: list,
      selection: row.selection as ScraperSelection,
      entryCount: list.length > 0 ? list.length : row.entry_count,
      lastRunAt: row.last_run_at,
      error: row.error,
      warning: row.warning,
      followUp: row.follow_up as ScraperFollowUp | null,
      lastUpdate: row.last_update as ScraperUpdate | null,
      lastIngest: storedIngest(row.selection),
    });
  });
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
  const events = Array.isArray(row.events)
    ? row.events.filter(isEvent).map(withoutStoredThumb)
    : [];
  const preview = Array.isArray(row.preview)
    ? row.preview.filter(isEvent).map(withoutStoredThumb)
    : [];
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
    lastUpdate: normalizeUpdate(row.lastUpdate),
    lastIngest: normalizeIngest(row.lastIngest) ?? storedIngest(row.selection),
  };
}

function storedIngest(selection: unknown): ScraperIngest | null {
  if (!selection || typeof selection !== "object") return null;
  return normalizeIngest((selection as { lastIngest?: unknown }).lastIngest);
}

function normalizeUpdate(value: unknown): ScraperUpdate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ScraperUpdate>;
  if (typeof row.at !== "string") return null;
  const num = (item: unknown) =>
    typeof item === "number" && Number.isFinite(item) ? item : 0;
  return {
    at: row.at,
    updated: num(row.updated),
    added: num(row.added),
    removed: num(row.removed),
    unchanged: num(row.unchanged),
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

function withoutStoredThumb(event: ScrapedEvent): ScrapedEvent {
  return event;
}

function isEvent(value: unknown): value is ScrapedEvent {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Record<string, unknown>).name === "string";
}

function remember(list: Scraper[]): void {
  memory = list;
  writeLocalBackup(list);
  notify();
}

function notify(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UPDATED_EVENT));
}

function writeLocalBackup(list: Scraper[]): void {
  if (typeof window === "undefined") return;
  const payload = isScraperDbAvailable()
    ? list.map((item) => ({
        ...item,
        preview: [],
        events: [],
      }))
    : list;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          list.map((item) => ({
            ...item,
            preview: [],
            events: [],
          }))
        )
      );
    } catch {
      // Backup ist optional, die Daten liegen in der DB bzw. im Speicher.
    }
  }
}

function readLocal(): Scraper[] {
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

function ensureUuidId(scraper: Scraper): Scraper {
  if (isUuid(scraper.id)) return scraper;
  return { ...scraper, id: createId() };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}
