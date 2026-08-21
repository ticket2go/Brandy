import { labelForField, type ProbeField } from "@/lib/event-scraper-fields";

export type EventimEvent = {
  name: string;
  date: string | null;
  image: string | null;
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
      key: "event.venue",
      label: labelForField("venue"),
      group: "event",
      sample: first?.venue ?? null,
    },
    {
      key: "event.city",
      label: "Stadt",
      group: "event",
      sample: first?.city ?? null,
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
  const query = queryFromEventimUrl(pageUrl);

  const params = new URLSearchParams({
    webId,
    language: tld === "de" || tld === "at" || tld === "ch" ? "de" : "en",
    page: "1",
    sort: "DateAsc",
    top: "12",
  });
  if (query.city) params.set("city_names", query.city);
  if (query.searchTerm) params.set("search_term", query.searchTerm);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${PRODUCTS_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        origin: `${pageUrl.protocol}//${pageUrl.host}`,
        referer: `${pageUrl.protocol}//${pageUrl.host}/`,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        isAccessDenied(text)
          ? "Eventim hat die Anfrage blockiert."
          : `Eventim API HTTP ${response.status}`
      );
    }
    if (isAccessDenied(text)) {
      throw new Error("Eventim hat die Anfrage blockiert.");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Eventim hat keine Eventdaten geliefert.");
    }
    return parseEventimProducts(payload);
  } finally {
    clearTimeout(timer);
  }
}

export function parseEventimProducts(payload: unknown): EventimEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const products = (payload as { products?: unknown }).products;
  if (!Array.isArray(products)) return [];

  const events: EventimEvent[] = [];
  for (const raw of products) {
    if (!raw || typeof raw !== "object") continue;
    const product = raw as Record<string, unknown>;
    const name = asString(product.name);
    if (!name) continue;
    const live = asRecord(nested(product, ["typeAttributes", "liveEntertainment"]));
    const location = asRecord(nested(live, ["location"]));
    events.push({
      name,
      date:
        asString(live?.startDate) ??
        asString(product.startDate) ??
        asString(product.eventDate),
      image:
        asString(product.imageUrl) ??
        asString(product.image) ??
        firstImage(product.images) ??
        asString(live?.imageUrl),
      venue:
        asString(location?.name) ??
        asString(nested(product, ["venue", "name"])),
      city:
        asString(location?.city) ??
        asString(nested(product, ["venue", "city"])),
      url: eventLink(product),
    });
  }
  return events;
}

function queryFromEventimUrl(pageUrl: URL): {
  city?: string;
  searchTerm?: string;
  productId?: string;
} {
  const segments = pageUrl.pathname.split("/").filter(Boolean);
  const type = segments[0]?.toLowerCase();
  const value = segments[1] ? decodeURIComponent(segments[1]) : "";

  if (type === "city" && value) {
    return { city: cityFromSlug(value) };
  }
  if (type === "event" && value) {
    const productId = value.match(/(\d+)\/?$/)?.[1];
    const searchTerm = humanizeSlug(value.replace(/-\d+$/, ""));
    return { productId, searchTerm };
  }
  if ((type === "artist" || type === "attraction") && value) {
    return { searchTerm: humanizeSlug(value) };
  }
  const search = pageUrl.searchParams.get("search_term") ?? pageUrl.searchParams.get("q");
  if (search) return { searchTerm: search };
  return {};
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
