import { createHash } from "crypto";

import { eventKey, type ScrapedEvent } from "@/lib/scraped-event";

export type GethypedLocation = {
  name: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
};

export type GethypedEvent = {
  external_id: string;
  name: string;
  start: string;
  start_time_known?: boolean;
  location: GethypedLocation;
  image_url?: string;
  ticket_url?: string;
  price_from?: number;
  currency?: string;
  source_updated_at?: string;
  raw?: Record<string, unknown>;
};

export type MappedGethyped =
  | { ok: true; event: GethypedEvent }
  | { ok: false; name: string; reason: string };

const BLOCKED = [
  "gutschein",
  "geschenkgutschein",
  "wertgutschein",
  "wert gutschein",
  "abo",
  "abonnement",
  "wahlabo",
  "jahresabo",
  "dauerkarte",
  "treue ticket",
  "treueticket",
  "testevent",
  "testveranstaltung",
];

export function mapScrapedEvents(events: ScrapedEvent[]): {
  accepted: GethypedEvent[];
  skipped: Array<{ name: string; reason: string }>;
} {
  const accepted: GethypedEvent[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const event of events) {
    const mapped = mapScrapedEvent(event);
    if (!mapped.ok) {
      skipped.push({ name: mapped.name, reason: mapped.reason });
      continue;
    }
    if (seen.has(mapped.event.external_id)) continue;
    seen.add(mapped.event.external_id);
    accepted.push(mapped.event);
  }
  return { accepted, skipped };
}

export function mapScrapedEvent(event: ScrapedEvent): MappedGethyped {
  const name = event.name.trim();
  if (name.length < 3 || name.length > 200) {
    return skip(name || "Ohne Namen", "Name muss zwischen 3 und 200 Zeichen lang sein.");
  }
  if (isPlaceholderName(name) || hasBlockedWord(name)) {
    return skip(name, "Name ist ein Platzhalter oder enthält ein gesperrtes Wort.");
  }

  const start = toStart(event);
  if (!start) {
    return skip(name, "Kein gültiges Datum.");
  }
  if (start.day < berlinToday()) {
    return skip(name, "Beginn liegt in der Vergangenheit.");
  }
  if (start.day > berlinMaxDay()) {
    return skip(name, "Beginn liegt mehr als drei Jahre in der Zukunft.");
  }

  const location = toLocation(event);
  if (!location) {
    return skip(name, "Kein Veranstaltungsort.");
  }

  const imageUrl = publicUrl(event.heroImage);
  const ticketUrl = publicUrl(event.ticketUrl);
  const priceFrom = parsePrice(event.price);

  const payload: GethypedEvent = {
    external_id: externalId(event),
    name,
    start: start.iso,
    location,
    source_updated_at: new Date().toISOString(),
    raw: compactRaw(event),
  };
  if (!start.timeKnown) payload.start_time_known = false;
  if (imageUrl) payload.image_url = imageUrl;
  if (ticketUrl) payload.ticket_url = ticketUrl;
  if (priceFrom != null) {
    payload.price_from = priceFrom;
    payload.currency = "EUR";
  }
  return { ok: true, event: payload };
}

export function chunkEvents<T>(items: T[], maxCount: number, maxBytes: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 2;
  for (const item of items) {
    const extra = Buffer.byteLength(JSON.stringify(item), "utf8") + 1;
    if (
      current.length > 0 &&
      (current.length >= maxCount || size + extra > maxBytes)
    ) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(item);
    size += extra;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function externalId(event: ScrapedEvent): string {
  const digest = createHash("sha256").update(eventKey(event)).digest("hex").slice(0, 32);
  return `ev-${digest}`;
}

function toStart(event: ScrapedEvent): { iso: string; day: string; timeKnown: boolean } | null {
  const raw = event.startsAt?.trim() || "";
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!day) return null;
  const timeMatch = raw.match(/T(\d{2}):(\d{2})/);
  const timeKnown = Boolean(event.time) || Boolean(timeMatch && timeMatch[0] !== "T00:00");
  const iso = timeKnown
    ? raw.replace(/\.\d+Z?$/, "").replace(/Z$/, "")
    : `${day}T00:00:00`;
  return { iso, day, timeKnown };
}

function toLocation(event: ScrapedEvent): GethypedLocation | null {
  const venue = clean(event.venue);
  const city = clean(event.city);
  const parsed = splitLocation(event.location);
  const name = venue || parsed.name || city;
  if (!name) return null;
  const location: GethypedLocation = { name, country: "DE" };
  const resolvedCity = city || (parsed.city && parsed.city !== name ? parsed.city : null);
  if (resolvedCity) location.city = resolvedCity;
  return location;
}

function splitLocation(value: string | null): { name: string | null; city: string | null } {
  const text = clean(value);
  if (!text) return { name: null, city: null };
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { name: parts[0] ?? null, city: parts[parts.length - 1] ?? null };
  }
  return { name: text, city: null };
}

function publicUrl(value: string | null): string | undefined {
  const url = value?.trim() ?? "";
  if (!url || url.length > 2048) return undefined;
  if (!/^https?:\/\//i.test(url)) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (isPrivateHost(parsed.hostname.toLowerCase())) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function parsePrice(value: string | null): number | null {
  if (!value) return null;
  const compact = value.replace(/\s/g, "");
  const match = compact.match(
    /(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+,\d{1,2}|\d+(?:\.\d{1,2})?)/
  );
  if (!match?.[1]) return null;
  let raw = match[1];
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000) return null;
  return amount;
}

function compactRaw(event: ScrapedEvent): Record<string, unknown> {
  return {
    heroImage: event.heroImage,
    ticketUrl: event.ticketUrl,
    productGroupId: event.productGroupId ?? null,
    city: event.city,
    venue: event.venue,
  };
}

function hasBlockedWord(text: string): boolean {
  const normalized = text.toLowerCase();
  return BLOCKED.some((word) => {
    if (word.includes(" ")) return normalized.includes(word);
    return new RegExp(`(^|[^a-zäöüß])${escapeRegExp(word)}([^a-zäöüß]|$)`, "i").test(
      normalized
    );
  });
}

function isPlaceholderName(name: string): boolean {
  return /^(tba|tbd|n\/?a|n\.?\s*a\.?|test|testevent|testveranstaltung)$/i.test(
    name.trim()
  );
}

function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function berlinMaxDay(): string {
  const today = berlinToday();
  const year = Number(today.slice(0, 4)) + 3;
  return `${year}${today.slice(4)}`;
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local") || host === "127.0.0.1") {
    return true;
  }
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 16 && second <= 31;
}

function clean(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function skip(name: string, reason: string): MappedGethyped {
  return { ok: false, name, reason };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
