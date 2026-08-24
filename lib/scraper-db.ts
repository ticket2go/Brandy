import { supabase } from "@/lib/supabase/client";
import { safeQuery } from "@/lib/supabase/safeQuery";
import type { Json } from "@/lib/supabase/types";
import { dedupeEvents, eventKey, type ScrapedEvent } from "@/lib/scraped-event";

import type { Scraper } from "@/lib/scrapers";

export type ScraperRow = {
  id: string;
  name: string;
  url: string;
  entry_count: number;
  last_run_at: string | null;
  error: string | null;
  warning: string | null;
  follow_up: Json | null;
  last_update: Json | null;
  selection: Json;
  created_at: string;
  updated_at: string;
};

export type ScraperEventRow = {
  id: string;
  scraper_id: string;
  event_key: string;
  name: string;
  venue: string | null;
  city: string | null;
  location: string | null;
  date: string | null;
  time: string | null;
  starts_at: string | null;
  hero_image: string | null;
  ticket_url: string | null;
  price: string | null;
  product_group_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_CHUNK = 150;
const KEY_PAGE = 1000;

type PendingWrite = {
  scraper: Scraper;
  events: boolean;
};

const pending = new Map<string, PendingWrite>();
let drainPromise = Promise.resolve();
let dbAvailable: boolean | null = null;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isScraperDbAvailable(): boolean {
  return dbAvailable === true;
}

export function eventFromRow(row: ScraperEventRow): ScrapedEvent {
  return {
    name: row.name,
    venue: row.venue,
    city: row.city,
    location: row.location,
    date: row.date,
    time: row.time,
    startsAt: row.starts_at,
    heroImage: row.hero_image,
    ticketUrl: row.ticket_url,
    price: row.price,
    productGroupId: row.product_group_id,
  };
}

export async function fetchScraperRows(): Promise<{
  scrapers: ScraperRow[];
  events: ScraperEventRow[];
} | null> {
  if (dbAvailable === false) return null;
  try {
    const scrapersResult = await safeQuery(
      () =>
        supabase
          .from("scrapers")
          .select("*")
          .order("created_at", { ascending: true }),
      { timeoutMs: 8000, label: "scrapers" }
    );
    if (scrapersResult.error) {
      if (isMissingTable(scrapersResult.error)) dbAvailable = false;
      console.error("[eventscraper] scrapers laden", scrapersResult.error);
      return null;
    }
    dbAvailable = true;
    const eventsResult = await safeQuery(
      () =>
        supabase
          .from("scraper_events")
          .select("*")
          .order("position", { ascending: true }),
      { timeoutMs: 20000, label: "scraper-events" }
    );
    if (eventsResult.error) {
      console.error("[eventscraper] events laden", eventsResult.error);
      return {
        scrapers: (scrapersResult.data ?? []) as ScraperRow[],
        events: [],
      };
    }
    return {
      scrapers: (scrapersResult.data ?? []) as ScraperRow[],
      events: (eventsResult.data ?? []) as ScraperEventRow[],
    };
  } catch (error) {
    console.error("[eventscraper] scrapers laden", error);
    return null;
  }
}

export function scheduleScraperPersist(
  scraper: Scraper,
  options: { events: boolean }
): void {
  if (!isUuid(scraper.id) || dbAvailable === false) return;
  const previous = pending.get(scraper.id);
  pending.set(scraper.id, {
    scraper,
    events: Boolean(previous?.events || options.events),
  });
  drainPromise = drainPromise.then(runDrain).catch((error) => {
    console.error("[eventscraper] persist", error);
  });
}

export function flushScraperPersists(): Promise<void> {
  return drainPromise;
}

export async function deleteScraperRow(id: string): Promise<void> {
  pending.delete(id);
  if (!isUuid(id) || dbAvailable === false) return;
  try {
    const result = await safeQuery(
      () => supabase.from("scrapers").delete().eq("id", id),
      { timeoutMs: 8000, label: "scraper-delete" }
    );
    if (result.error) {
      if (isMissingTable(result.error)) dbAvailable = false;
      console.error("[eventscraper] scraper löschen", result.error);
    } else {
      dbAvailable = true;
    }
  } catch (error) {
    console.error("[eventscraper] scraper löschen", error);
  }
}

async function runDrain(): Promise<void> {
  while (pending.size > 0) {
    const batch = [...pending.values()];
    pending.clear();
    for (const item of batch) {
      await persistOne(item.scraper, item.events);
    }
  }
}

async function persistOne(scraper: Scraper, writeEvents: boolean): Promise<void> {
  if (dbAvailable === false) return;
  try {
    const result = await safeQuery(
      () => supabase.from("scrapers").upsert(toScraperInsert(scraper)),
      { timeoutMs: 8000, label: "scraper-upsert" }
    );
    if (result.error) {
      if (isMissingTable(result.error)) dbAvailable = false;
      console.error("[eventscraper] scraper speichern", result.error);
      return;
    }
    dbAvailable = true;
    if (!writeEvents) return;
    const events = sourceEvents(scraper);
    if (events.length === 0) return;
    await replaceEvents(scraper.id, events);
  } catch (error) {
    console.error("[eventscraper] scraper speichern", error);
  }
}

function toScraperInsert(scraper: Scraper) {
  return {
    id: scraper.id,
    name: scraper.name,
    url: scraper.url,
    entry_count: scraper.entryCount,
    last_run_at: scraper.lastRunAt,
    error: scraper.error,
    warning: scraper.warning,
    follow_up: (scraper.followUp ?? null) as unknown as Json,
    last_update: (scraper.lastUpdate ?? null) as unknown as Json,
    selection: {
      ...scraper.selection,
      lastIngest: scraper.lastIngest,
    } as unknown as Json,
    created_at: scraper.createdAt,
  };
}

function sourceEvents(scraper: Scraper): ScrapedEvent[] {
  return scraper.preview.length > 0 ? scraper.preview : scraper.events;
}

function toEventInsert(scraperId: string, event: ScrapedEvent, position: number) {
  return {
    scraper_id: scraperId,
    event_key: eventKey(event),
    name: event.name,
    venue: event.venue,
    city: event.city,
    location: event.location,
    date: event.date,
    time: event.time,
    starts_at: event.startsAt,
    hero_image: event.heroImage,
    ticket_url: event.ticketUrl,
    price: event.price,
    product_group_id: event.productGroupId ?? null,
    position,
  };
}

async function replaceEvents(
  scraperId: string,
  events: ScrapedEvent[]
): Promise<void> {
  const unique = dedupeEvents(events);
  const keep = new Set(unique.map((event) => eventKey(event)));
  const existing = await listEventKeys(scraperId);
  const rows = unique.map((event, index) =>
    toEventInsert(scraperId, event, index)
  );
  for (const chunk of chunkOf(rows, EVENT_CHUNK)) {
    const result = await safeQuery(
      () =>
        supabase.from("scraper_events").upsert(chunk, {
          onConflict: "scraper_id,event_key",
        }),
      { timeoutMs: 20000, label: "scraper-events-upsert" }
    );
    if (result.error) {
      console.error("[eventscraper] events speichern", result.error);
      return;
    }
  }
  const stale = existing.filter((key) => !keep.has(key));
  for (const chunk of chunkOf(stale, EVENT_CHUNK)) {
    const result = await safeQuery(
      () =>
        supabase
          .from("scraper_events")
          .delete()
          .eq("scraper_id", scraperId)
          .in("event_key", chunk),
      { timeoutMs: 15000, label: "scraper-events-delete" }
    );
    if (result.error) {
      console.error("[eventscraper] events löschen", result.error);
      return;
    }
  }
}

async function listEventKeys(scraperId: string): Promise<string[]> {
  const keys: string[] = [];
  let from = 0;
  while (true) {
    const result = await safeQuery(
      () =>
        supabase
          .from("scraper_events")
          .select("event_key")
          .eq("scraper_id", scraperId)
          .range(from, from + KEY_PAGE - 1),
      { timeoutMs: 12000, label: "scraper-event-keys" }
    );
    if (result.error) {
      console.error("[eventscraper] event keys", result.error);
      return keys;
    }
    const rows = (result.data ?? []) as Array<{ event_key: string }>;
    keys.push(...rows.map((row) => row.event_key));
    if (rows.length < KEY_PAGE) break;
    from += KEY_PAGE;
  }
  return keys;
}

function chunkOf<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(message) ||
    /relation .+ does not exist/i.test(message)
  );
}
