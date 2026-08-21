import {
  combineLocation,
  formatPrice,
  type ScrapedEvent,
} from "@/lib/scraped-event";

export type ParsedPage = {
  heroImage: string | null;
  title: string | null;
  events: ScrapedEvent[];
  followUpUrl: string | null;
  productLinks: string[];
};

const EVENT_TYPE = /event$/i;
const SHOW_ALL_LABEL = /alle\s+\d+\s+events?\s+anzeigen|alle\s+events?\s+anzeigen|alle\s+termine/i;

export function parseEventimPage(html: string, pageUrl: string): ParsedPage {
  const origin = originOf(pageUrl);
  const heroImage = absolute(
    metaContent(html, "og:image") ??
      metaContent(html, "og:image:url") ??
      metaContent(html, "twitter:image") ??
      linkHref(html, "image_src"),
    origin
  );
  const title =
    metaContent(html, "og:title") ?? metaContent(html, "twitter:title") ?? heading(html);

  const events = parseJsonLdEvents(html, origin, heroImage);
  const calendar = parseCalendarEvents(html, origin, heroImage, title);

  return {
    heroImage,
    title,
    events: events.length > 0 ? events : calendar,
    followUpUrl: findShowAllLink(html, origin),
    productLinks: collectProductLinks(html, origin),
  };
}

export function findShowAllLink(html: string, origin: string): string | null {
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const href = attr(attrs, "href");
    if (!href || href.startsWith("#")) continue;
    const label = [
      text(match[2] ?? ""),
      attr(attrs, "aria-label") ?? "",
      attr(attrs, "title") ?? "",
    ].join(" ");
    if (SHOW_ALL_LABEL.test(label)) return absolute(href, origin);
  }
  return null;
}

export function parseJsonLdEvents(
  html: string,
  origin: string,
  fallbackImage: string | null
): ScrapedEvent[] {
  const out: ScrapedEvent[] = [];
  const pattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    try {
      walkJsonLd(JSON.parse(raw), out, origin, fallbackImage, 0);
    } catch {
      continue;
    }
  }
  return out;
}

function walkJsonLd(
  value: unknown,
  out: ScrapedEvent[],
  origin: string,
  fallbackImage: string | null,
  depth: number
) {
  if (value == null || depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      walkJsonLd(item, out, origin, fallbackImage, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  for (const key of ["@graph", "subEvent", "event", "itemListElement", "item"]) {
    if (record[key]) walkJsonLd(record[key], out, origin, fallbackImage, depth + 1);
  }

  const types = typesOf(record["@type"]);
  if (!types.some((type) => EVENT_TYPE.test(type))) return;

  const event = eventFromJsonLd(record, origin, fallbackImage);
  if (event) out.push(event);
}

function eventFromJsonLd(
  record: Record<string, unknown>,
  origin: string,
  fallbackImage: string | null
): ScrapedEvent | null {
  const name = str(record.name) ?? str(record.headline);
  const startsAt = str(record.startDate) ?? str(record.doorTime);
  const place = obj(first(record.location));
  const address = obj(place?.address) ?? obj(record.address);
  const venue = str(place?.name);
  const city =
    str(address?.addressLocality) ??
    str(place?.addressLocality) ??
    str(record.addressLocality);
  if (!name && !startsAt) return null;

  const offer = obj(first(record.offers));
  const from = num(offer?.lowPrice ?? offer?.price);
  const to = num(offer?.highPrice);
  const ticketUrl = absolute(
    str(offer?.url) ?? str(record.url) ?? str(record["@id"]),
    origin
  );

  return {
    name: name ?? "Event",
    venue,
    city,
    location: combineLocation(venue, city),
    date: null,
    time: null,
    startsAt,
    heroImage: absolute(imageOf(record.image), origin) ?? fallbackImage,
    ticketUrl,
    price: formatPrice(from, to, str(offer?.priceCurrency)),
  };
}

function parseCalendarEvents(
  html: string,
  origin: string,
  fallbackImage: string | null,
  fallbackName: string | null
): ScrapedEvent[] {
  const out: ScrapedEvent[] = [];
  for (const payload of jsonBlobs(html)) {
    collectCalendarRows(payload, out, origin, fallbackImage, fallbackName, 0);
    if (out.length > 0) break;
  }
  return out;
}

function collectCalendarRows(
  value: unknown,
  out: ScrapedEvent[],
  origin: string,
  fallbackImage: string | null,
  fallbackName: string | null,
  depth: number
) {
  if (value == null || depth > 10) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCalendarRows(item, out, origin, fallbackImage, fallbackName, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const event = eventFromCalendarRow(record, origin, fallbackImage, fallbackName);
  if (event) {
    out.push(event);
    return;
  }
  for (const nested of Object.values(record)) {
    collectCalendarRows(nested, out, origin, fallbackImage, fallbackName, depth + 1);
  }
}

function eventFromCalendarRow(
  record: Record<string, unknown>,
  origin: string,
  fallbackImage: string | null,
  fallbackName: string | null
): ScrapedEvent | null {
  const startsAt =
    str(record.startDate) ??
    str(record.eventDate) ??
    str(record.date) ??
    str(obj(record.typeAttributes)?.startDate);
  if (!startsAt || !/\d{4}-\d{2}-\d{2}/.test(startsAt)) return null;

  const live = obj(nested(record, ["typeAttributes", "liveEntertainment"]));
  const place = obj(live?.location) ?? obj(record.location) ?? obj(record.venue);
  const venue =
    str(place?.name) ?? str(record.venueName) ?? str(record.venue);
  const city = str(place?.city) ?? str(record.city) ?? str(record.cityName);
  const name = str(record.name) ?? str(record.title) ?? fallbackName;
  if (!name) return null;

  const priceFrom = num(
    record.price ??
      record.minPrice ??
      record.priceFrom ??
      nested(record, ["priceRange", "min"]) ??
      nested(record, ["prices", "from"])
  );
  const priceTo = num(
    record.maxPrice ?? nested(record, ["priceRange", "max"]) ?? nested(record, ["prices", "to"])
  );

  return {
    name,
    venue,
    city,
    location: combineLocation(venue, city),
    date: null,
    time: null,
    startsAt,
    heroImage: absolute(imageOf(record.image ?? record.imageUrl), origin) ?? fallbackImage,
    ticketUrl: absolute(linkOf(record), origin),
    price: formatPrice(priceFrom, priceTo, str(record.currency ?? record.priceCurrency)),
  };
}

function collectProductLinks(html: string, origin: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const pattern =
    /href=["']([^"']*\/(?:artist|attraction|eventseries|event)\/[^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = absolute(match[1] ?? "", origin);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    links.push(href);
  }
  return links;
}

function jsonBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const type = (attr(attrs, "type") ?? "").toLowerCase();
    const body = (match[2] ?? "").trim();
    if (!body) continue;
    if (type.includes("ld+json")) continue;
    if (type.includes("json") || attr(attrs, "id")) {
      const parsed = tryParse(body);
      if (parsed) blobs.push(parsed);
      continue;
    }
    for (const candidate of body.match(/\{[\s\S]{200,}?\}(?=\s*[;,)\]]|$)/g) ?? []) {
      const parsed = tryParse(candidate);
      if (parsed) blobs.push(parsed);
    }
  }
  return blobs;
}

function tryParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function linkOf(record: Record<string, unknown>): string | null {
  const direct = str(record.link) ?? str(record.ticketUrl) ?? str(record.href);
  if (direct) return direct;
  const url = record.url;
  if (typeof url === "string") return url;
  const holder = obj(url);
  if (!holder) return null;
  const path = str(holder.path);
  const domain = str(holder.domain);
  if (path && domain) return `${domain.replace(/\/$/, "")}${path}`;
  return path;
}

function imageOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageOf(item);
      if (found) return found;
    }
    return null;
  }
  const record = obj(value);
  return str(record?.url) ?? str(record?.src) ?? str(record?.contentUrl);
}

function metaContent(html: string, name: string): string | null {
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:property|name)=["']${escape(name)}["'][^>]*>`,
    "i"
  );
  const tag = html.match(pattern)?.[0];
  return tag ? attr(tag, "content") : null;
}

function linkHref(html: string, rel: string): string | null {
  const tag = html.match(
    new RegExp(`<link\\b[^>]*rel=["']${escape(rel)}["'][^>]*>`, "i")
  )?.[0];
  return tag ? attr(tag, "href") : null;
}

function heading(html: string): string | null {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? text(match[1] ?? "") || null : null;
}

function typesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function nested(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = obj(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function obj(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return decode(value).trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const record = obj(value);
  if (record) return str(record.name) ?? str(record["@value"]);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d,.-]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function absolute(
  value: string | null | undefined,
  origin: string
): string | null {
  if (!value) return null;
  try {
    return new URL(value, origin).toString();
  } catch {
    return null;
  }
}

function originOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return "https://www.eventim.de";
  }
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  if (!match) return null;
  return decode(match[1] ?? match[2] ?? match[3] ?? "") || null;
}

function text(value: string): string {
  return decode(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
