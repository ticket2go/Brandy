export type EventimDetailEvent = {
  name: string | null;
  date: string | null;
  image: string | null;
  venue: string | null;
  city: string | null;
  location: string | null;
  url: string | null;
};

export type EventimDetailPage = {
  name: string | null;
  heroImage: string | null;
  date: string | null;
  venue: string | null;
  city: string | null;
  location: string | null;
  cities: string[];
  events: EventimDetailEvent[];
  nextData: unknown | null;
};

const EVENT_TYPES = /^(Music|Theater|Comedy|Festival|Sports|Education|Childrens|Literary|Dance|VisualArts)?Event$/i;

export function productGroupIdFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl, "https://www.eventim.de");
    const segments = url.pathname.split("/").filter(Boolean);
    const type = segments[0]?.toLowerCase() ?? "";

    if (type === "eventseries") {
      return segments[1]?.match(/^(\d{5,})$/)?.[1] ?? null;
    }

    if (type === "artist" || type === "attraction") {
      if (type === "artist" && segments.length < 3) return null;
      const last = segments[segments.length - 1] ?? "";
      return last.match(/-(\d{5,})$/)?.[1] ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

export function isEventimTourUrl(rawUrl: string): boolean {
  if (productGroupIdFromUrl(rawUrl)) return true;
  try {
    const path = new URL(rawUrl, "https://www.eventim.de").pathname.toLowerCase();
    return (
      path.startsWith("/artist/") ||
      path.startsWith("/attraction/") ||
      path.startsWith("/eventseries/")
    );
  } catch {
    return false;
  }
}

export function uniqueCities(
  ...values: Array<string | null | undefined | Array<string | null | undefined>>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      const city = item?.replace(/\s+/g, " ").trim();
      if (!city) continue;
      const key = city.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(city);
    }
  }
  return out;
}

export function parseEventimDetailHtml(
  html: string,
  pageUrl?: string
): EventimDetailPage {
  const origin = originFrom(pageUrl);
  const jsonLdEvents = parseJsonLdEvents(html, origin);
  const microEvents = parseMicrodataEvents(html, origin);
  const events = mergeDetailEvents([...jsonLdEvents, ...microEvents]);
  const heroImage =
    metaContent(html, "og:image") ??
    metaContent(html, "og:image:url") ??
    metaContent(html, "og:image:secure_url") ??
    metaContent(html, "twitter:image") ??
    metaContent(html, "twitter:image:src") ??
    linkHref(html, "image_src") ??
    firstEventImage(events);
  const name =
    firstEventName(events) ??
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    heading(html);
  const cities = uniqueCities(
    events.map((event) => event.city),
    itempropValues(html, "addressLocality"),
    dataValues(html, "city")
  );
  const first = events[0];

  return {
    name,
    heroImage: absolutize(heroImage, origin),
    date: first?.date ?? metaContent(html, "event:start_date"),
    venue: first?.venue ?? itempropValues(html, "name")[0] ?? null,
    city: first?.city ?? cities[0] ?? null,
    location:
      first?.location ??
      formatLocation(first?.venue ?? null, first?.city ?? cities[0] ?? null),
    cities,
    events: events.map((event) => ({
      ...event,
      image: absolutize(event.image ?? heroImage, origin),
      url: absolutize(event.url, origin),
    })),
    nextData: parseNextData(html),
  };
}

export function parseJsonLdEvents(
  html: string,
  origin?: string
): EventimDetailEvent[] {
  const events: EventimDetailEvent[] = [];
  const scriptPattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    try {
      collectJsonLd(JSON.parse(raw), events, origin, 0);
    } catch {
      continue;
    }
  }
  return mergeDetailEvents(events);
}

function parseMicrodataEvents(
  html: string,
  origin?: string
): EventimDetailEvent[] {
  const events: EventimDetailEvent[] = [];
  const blockPattern =
    /<(div|article|li|section)\b[^>]*itemtype=["'][^"']*Event["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) !== null) {
    const block = match[0];
    const name =
      itempropContent(block, "name") ??
      itempropText(block, "name") ??
      null;
    const date =
      itempropContent(block, "startDate") ??
      itempropText(block, "startDate");
    const venue =
      itempropContent(block, "name", "Place") ??
      nestedItemprop(block, "location", "name");
    const city =
      itempropContent(block, "addressLocality") ??
      nestedItemprop(block, "address", "addressLocality");
    const url =
      itempropContent(block, "url") ??
      hrefIn(block, /\/event\//i);
    if (!name && !date && !city && !venue) continue;
    events.push({
      name,
      date,
      image: itempropContent(block, "image"),
      venue,
      city,
      location: formatLocation(venue, city),
      url: absolutize(url, origin),
    });
  }
  return events;
}

function collectJsonLd(
  value: unknown,
  out: EventimDetailEvent[],
  origin: string | undefined,
  depth: number
) {
  if (value == null || depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLd(item, out, origin, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (record["@graph"]) collectJsonLd(record["@graph"], out, origin, depth + 1);

  const types = asTypes(record["@type"]);
  if (types.some((type) => /EventSeries/i.test(type))) {
    collectJsonLd(record.subEvent ?? record.event, out, origin, depth + 1);
  }
  if (types.some((type) => EVENT_TYPES.test(type))) {
    const event = eventFromJsonLd(record, origin);
    if (event) out.push(event);
    collectJsonLd(record.subEvent, out, origin, depth + 1);
  }
}

function eventFromJsonLd(
  record: Record<string, unknown>,
  origin?: string
): EventimDetailEvent | null {
  const name = asText(record.name) ?? asText(record.headline);
  const location = asRecord(firstOf(record.location));
  const address = asRecord(location?.address) ?? asRecord(record.address);
  const venue = asText(location?.name) ?? asText(record.locationName);
  const city =
    asText(address?.addressLocality) ??
    asText(location?.addressLocality) ??
    asText(record.addressLocality);
  const date =
    asText(record.startDate) ??
    asText(record.doorTime) ??
    asText(record.endDate);
  const url = asText(record.url) ?? asText(record["@id"]);
  if (!name && !date && !city && !venue) return null;
  return {
    name,
    date,
    image: imageFromJsonLd(record.image),
    venue,
    city,
    location: formatLocation(venue, city),
    url: absolutize(url, origin),
  };
}

function parseNextData(html: string): unknown | null {
  const match = html.match(
    /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function mergeDetailEvents(events: EventimDetailEvent[]): EventimDetailEvent[] {
  const seen = new Set<string>();
  const out: EventimDetailEvent[] = [];
  for (const event of events) {
    const key = [
      event.url ?? "",
      event.name ?? "",
      event.date ?? "",
      event.city ?? "",
      event.venue ?? "",
    ]
      .join("|")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

function formatLocation(
  venue: string | null,
  city: string | null
): string | null {
  if (venue && city && venue !== city) return `${venue}, ${city}`;
  return venue ?? city;
}

function metaContent(html: string, name: string): string | null {
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:property|name|itemprop)=["']${escapeRegExp(name)}["'][^>]*>`,
    "i"
  );
  const tag = html.match(pattern)?.[0];
  return tag ? getAttr(tag, "content") : null;
}

function linkHref(html: string, rel: string): string | null {
  const pattern = new RegExp(
    `<link\\b[^>]*rel=["']${escapeRegExp(rel)}["'][^>]*>`,
    "i"
  );
  const tag = html.match(pattern)?.[0];
  return tag ? getAttr(tag, "href") : null;
}

function heading(html: string): string | null {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? decodeEntities(stripTags(match[1] ?? "")) : null;
}

function itempropValues(html: string, prop: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(
    `<[^>]+\\bitemprop=["']${escapeRegExp(prop)}["'][^>]*>([\\s\\S]*?)</`,
    "gi"
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const content = getAttr(match[0], "content") ?? decodeEntities(stripTags(match[1] ?? ""));
    if (content) values.push(content);
  }
  const metaPattern = new RegExp(
    `<meta\\b[^>]*itemprop=["']${escapeRegExp(prop)}["'][^>]*>`,
    "gi"
  );
  while ((match = metaPattern.exec(html)) !== null) {
    const content = getAttr(match[0], "content");
    if (content) values.push(content);
  }
  return values;
}

function itempropContent(
  html: string,
  prop: string,
  typeHint?: string
): string | null {
  const scoped = typeHint
    ? html.match(
        new RegExp(
          `itemtype=["'][^"']*${escapeRegExp(typeHint)}["'][\\s\\S]{0,1200}`,
          "i"
        )
      )?.[0] ?? html
    : html;
  const tag = scoped.match(
    new RegExp(
      `<[^>]+\\bitemprop=["']${escapeRegExp(prop)}["'][^>]*>`,
      "i"
    )
  )?.[0];
  return tag ? getAttr(tag, "content") ?? getAttr(tag, "href") ?? getAttr(tag, "src") : null;
}

function itempropText(html: string, prop: string): string | null {
  const match = html.match(
    new RegExp(
      `<[^>]+\\bitemprop=["']${escapeRegExp(prop)}["'][^>]*>([\\s\\S]*?)</`,
      "i"
    )
  );
  return match ? decodeEntities(stripTags(match[1] ?? "")) : null;
}

function nestedItemprop(
  html: string,
  parent: string,
  child: string
): string | null {
  const block = html.match(
    new RegExp(
      `itemprop=["']${escapeRegExp(parent)}["'][\\s\\S]{0,800}`,
      "i"
    )
  )?.[0];
  if (!block) return null;
  return itempropContent(block, child) ?? itempropText(block, child);
}

function dataValues(html: string, name: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(
    `\\bdata-${escapeRegExp(name)}=["']([^"']+)["']`,
    "gi"
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    if (match[1]) values.push(decodeEntities(match[1]));
  }
  return values;
}

function hrefIn(html: string, filter: RegExp): string | null {
  const pattern = /\b(?:href|content)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1] ?? "";
    if (filter.test(href)) return href;
  }
  return null;
}

function firstEventImage(events: EventimDetailEvent[]): string | null {
  for (const event of events) {
    if (event.image) return event.image;
  }
  return null;
}

function firstEventName(events: EventimDetailEvent[]): string | null {
  for (const event of events) {
    if (event.name) return event.name;
  }
  return null;
}

function imageFromJsonLd(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = imageFromJsonLd(item);
      if (url) return url;
    }
    return null;
  }
  const record = asRecord(value);
  return asText(record?.url) ?? asText(record?.contentUrl);
}

function asTypes(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const record = asRecord(value);
  if (record) return asText(record.name) ?? asText(record["@value"]);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function originFrom(pageUrl?: string): string | undefined {
  if (!pageUrl) return undefined;
  try {
    return new URL(pageUrl, "https://www.eventim.de").origin;
  } catch {
    return undefined;
  }
}

function absolutize(
  value: string | null | undefined,
  origin?: string
): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!origin) return value;
  try {
    return new URL(value, origin).toString();
  } catch {
    return value;
  }
}

function getAttr(tag: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  );
  const match = tag.match(pattern);
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? "") || null;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code))
    )
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
