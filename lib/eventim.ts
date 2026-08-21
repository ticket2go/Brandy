import type { ProbeField } from "@/lib/event-scraper-fields";

export type EventimEvent = {
  name: string;
  date: string | null;
  image: string | null;
  location: string | null;
  venue: string | null;
  city: string | null;
  url: string | null;
};

const PRODUCTS_URL =
  "https://public-api.eventim.com/websearch/search/api/exploration/v1/products";

const WEB_IDS: Record<string, string> = {
  de: "web__eventim-de",
  at: "web__eventim-at",
  ch: "web__eventim-ch",
};

const CITY_NAMES: Record<string, string> = {
  berlin: "Berlin",
  hamburg: "Hamburg",
  muenchen: "München",
  münchen: "München",
  koeln: "Köln",
  köln: "Köln",
  frankfurt: "Frankfurt",
  stuttgart: "Stuttgart",
  duesseldorf: "Düsseldorf",
  düsseldorf: "Düsseldorf",
  dusseldorf: "Düsseldorf",
  bremen: "Bremen",
  leipzig: "Leipzig",
  dresden: "Dresden",
  hannover: "Hannover",
  nurnberg: "Nürnberg",
  nürnberg: "Nürnberg",
  dortmund: "Dortmund",
  essen: "Essen",
  leipzigs: "Leipzig",
};

const EVENTIM_HOST = /(^|\.)eventim\.(de|at|ch|com)$/i;

export function isEventimUrl(rawUrl: string): boolean {
  try {
    return EVENTIM_HOST.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

export function eventFieldsFromEvents(events: EventimEvent[]): ProbeField[] {
  const first = events[0];
  const fields: ProbeField[] = [
    {
      key: "event.name",
      label: "Eventname",
      group: "event",
      sample: first?.name ?? null,
    },
    {
      key: "event.date",
      label: "Datum",
      group: "event",
      sample: first?.date ?? null,
    },
    {
      key: "event.image",
      label: "Bild",
      group: "event",
      sample: first?.image ?? null,
    },
    {
      key: "event.location",
      label: "Location",
      group: "event",
      sample: first?.location ?? first?.venue ?? first?.city ?? null,
    },
  ];
  return fields;
}

export async function fetchEventimEvents(
  rawUrl: string,
  timeoutMs = 8000
): Promise<EventimEvent[]> {
  const pageUrl = new URL(rawUrl);
  const tld = pageUrl.hostname.split(".").pop()?.toLowerCase() ?? "de";
  const webId = WEB_IDS[tld] ?? WEB_IDS.de;
  const query = eventimQueryFromUrl(pageUrl);

  const params = new URLSearchParams({
    webId,
    language: tld === "de" || tld === "at" || tld === "ch" ? "de" : "en",
    page: "1",
    sort: query.searchTerm ? "Recommendation" : "DateAsc",
    top: "50",
  });
  if (query.city) params.set("city_names", query.city);
  if (query.searchTerm) params.set("search_term", query.searchTerm);
  if (query.affiliate) params.set("retail_partner", query.affiliate);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = await fetchEventimCollection(
      PRODUCTS_URL,
      params,
      pageUrl,
      controller.signal
    );
    const events = parseEventimProducts(payload);
    if (events.length > 0 || !query.searchTerm) return events;

    const groups = await fetchEventimCollection(
      "https://public-api.eventim.com/websearch/search/api/exploration/v2/productGroups",
      params,
      pageUrl,
      controller.signal
    );
    return parseEventimProducts(groups);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchEventimCollection(
  endpoint: string,
  params: URLSearchParams,
  pageUrl: URL,
  signal: AbortSignal
): Promise<unknown> {
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    signal,
    headers: eventimHeaders(pageUrl),
  });
  const text = await response.text();
  if (!response.ok || isAccessDenied(text)) {
    throw new Error(
      isAccessDenied(text)
        ? "Eventim hat die Anfrage blockiert."
        : `Eventim API HTTP ${response.status}`
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Eventim hat keine Eventdaten geliefert.");
  }
}

function eventimHeaders(pageUrl: URL): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "de-DE,de;q=0.9,en;q=0.8",
    origin: `${pageUrl.protocol}//${pageUrl.host}`,
    referer: `${pageUrl.origin}/`,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  };
}

export function parseEventimProducts(payload: unknown): EventimEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const lists = [record.products, record.productGroups, record.events];
  const events: EventimEvent[] = [];

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const event = parseEventimItem(raw);
      if (event) events.push(event);
    }
  }
  return events;
}

function parseEventimItem(raw: unknown): EventimEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const product = raw as Record<string, unknown>;
  const name = asString(product.name) ?? asString(product.title);
  if (!name) return null;
  const live = asRecord(nested(product, ["typeAttributes", "liveEntertainment"]));
  const place = asRecord(nested(live, ["location"])) ?? asRecord(product.venue);
  const venue =
    asString(place?.name) ??
    asString(nested(product, ["venue", "name"])) ??
    asString(product.venueName);
  const city =
    asString(place?.city) ??
    asString(nested(product, ["venue", "city"])) ??
    asString(product.city);
  return {
    name,
    date:
      asString(live?.startDate) ??
      asString(product.startDate) ??
      asString(product.eventDate),
    image: imageFrom(product, live),
    location: formatLocation(venue, city),
    venue,
    city,
    url: eventLink(product),
  };
}

export function eventimQueryFromUrl(pageUrl: URL): {
  city?: string;
  searchTerm?: string;
  productId?: string;
  affiliate?: string;
} {
  const affiliate =
    pageUrl.searchParams.get("affiliate") ??
    pageUrl.searchParams.get("retail_partner") ??
    undefined;
  const search =
    pageUrl.searchParams.get("searchterm") ??
    pageUrl.searchParams.get("searchTerm") ??
    pageUrl.searchParams.get("search_term") ??
    pageUrl.searchParams.get("q");

  const segments = pageUrl.pathname.split("/").filter(Boolean);
  const type = segments[0]?.toLowerCase();
  const value = segments[1] ? decodeURIComponent(segments[1]) : "";

  if (type === "search" || search) {
    return {
      searchTerm: search?.trim() || undefined,
      affiliate: affiliate || undefined,
    };
  }
  if (type === "city" && value) {
    return { city: cityFromSlug(value), affiliate: affiliate || undefined };
  }
  if (type === "event" && value) {
    const productId = value.match(/(\d+)\/?$/)?.[1];
    const searchTerm = humanizeSlug(value.replace(/-\d+$/, ""));
    return { productId, searchTerm, affiliate: affiliate || undefined };
  }
  if ((type === "artist" || type === "attraction") && value) {
    return {
      searchTerm: humanizeSlug(value),
      affiliate: affiliate || undefined,
    };
  }
  return { affiliate: affiliate || undefined };
}

function cityFromSlug(slug: string): string {
  const base = slug.replace(/-\d+$/, "").toLowerCase();
  return CITY_NAMES[base] ?? capitalize(base.replace(/-/g, " "));
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => capitalize(part))
    .join(" ");
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function nested(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function formatLocation(
  venue: string | null,
  city: string | null
): string | null {
  if (venue && city && venue !== city) return `${venue}, ${city}`;
  return venue ?? city;
}

function imageFrom(
  product: Record<string, unknown>,
  live?: Record<string, unknown>
): string | null {
  return (
    asString(product.imageUrl) ??
    asString(asRecord(product.image)?.url) ??
    asString(product.image) ??
    firstImage(product.images) ??
    asString(live?.imageUrl)
  );
}

function firstImage(value: unknown): string | null {
  if (typeof value === "string") return asString(value);
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (typeof item === "string" && item.trim()) return item.trim();
    if (item && typeof item === "object") {
      const url =
        asString((item as { url?: unknown }).url) ??
        asString((item as { src?: unknown }).src);
      if (url) return url;
    }
  }
  return null;
}

function eventLink(product: Record<string, unknown>): string | null {
  const direct = asString(product.link);
  if (direct) return direct;
  const url = product.url;
  if (typeof url === "string") return url;
  if (url && typeof url === "object") {
    const path = asString((url as { path?: unknown }).path);
    const domain = asString((url as { domain?: unknown }).domain);
    if (path && domain) return `${domain.replace(/\/$/, "")}${path}`;
    if (path) return path;
  }
  return null;
}

function isAccessDenied(text: string): boolean {
  return /access denied|nicht erlaubt|permission to access/i.test(text);
}
