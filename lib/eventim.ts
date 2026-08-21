import type { ProbeField } from "@/lib/event-scraper-fields";
import {
  isEventimTourUrl,
  parseEventimDetailHtml,
  productGroupIdFromUrl,
  uniqueCities,
  type EventimDetailEvent,
} from "@/lib/eventim-detail";

export type EventimEvent = {
  name: string;
  date: string | null;
  image: string | null;
  heroImage: string | null;
  location: string | null;
  venue: string | null;
  city: string | null;
  cities: string[];
  url: string | null;
  tourUrl?: string | null;
  productGroupId?: string | null;
};

export { productGroupIdFromUrl, isEventimTourUrl };

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
const SEARCH_TIMEOUT_MS = 8000;
const DETAIL_TIMEOUT_MS = 6000;
const EXPAND_CONCURRENCY = 3;

export function isEventimUrl(rawUrl: string): boolean {
  try {
    return EVENTIM_HOST.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

export function eventFieldsFromEvents(events: EventimEvent[]): ProbeField[] {
  const first = events[0];
  const cities = uniqueCities(
    first?.cities,
    events.flatMap((event) => event.cities ?? []),
    events.map((event) => event.city)
  );
  return [
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
      sample: first?.image ?? first?.heroImage ?? null,
    },
    {
      key: "event.heroImage",
      label: "Herobild",
      group: "event",
      sample: first?.heroImage ?? first?.image ?? null,
    },
    {
      key: "event.location",
      label: "Ort",
      group: "event",
      sample: first?.location ?? first?.venue ?? first?.city ?? null,
    },
    {
      key: "event.cities",
      label: "Städte",
      group: "event",
      sample: cities.length > 0 ? cities.join(", ") : first?.city ?? null,
    },
  ];
}

export async function fetchEventimEvents(
  rawUrl: string,
  timeoutMs = SEARCH_TIMEOUT_MS
): Promise<EventimEvent[]> {
  const pageUrl = new URL(rawUrl);
  const groupId = productGroupIdFromUrl(rawUrl);
  if (groupId) {
    return expandProductGroup(groupId, pageUrl, rawUrl);
  }

  const events = await fetchSearchEvents(pageUrl, timeoutMs);
  return expandSearchEvents(events, pageUrl);
}

async function fetchSearchEvents(
  pageUrl: URL,
  timeoutMs: number
): Promise<EventimEvent[]> {
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
    const events = parseEventimProducts(payload, pageUrl.origin);
    if (events.length > 0 || !query.searchTerm) return events;

    const groups = await fetchEventimCollection(
      "https://public-api.eventim.com/websearch/search/api/exploration/v2/productGroups",
      params,
      pageUrl,
      controller.signal
    );
    return parseEventimProducts(groups, pageUrl.origin);
  } finally {
    clearTimeout(timer);
  }
}

async function expandSearchEvents(
  events: EventimEvent[],
  pageUrl: URL
): Promise<EventimEvent[]> {
  if (events.length === 0) return [];

  const seenGroups = new Set<string>();
  const chunks = await mapPool(events, EXPAND_CONCURRENCY, async (event) => {
    const groupId =
      productGroupIdFromUrl(event.url ?? "") ?? event.productGroupId ?? null;
    try {
      if (groupId && isEventimTourUrl(event.url ?? "")) {
        if (seenGroups.has(groupId)) return [];
        seenGroups.add(groupId);
        const expanded = await expandProductGroup(
          groupId,
          pageUrl,
          event.url
        );
        if (expanded.length > 0) return expanded;
      }
      if (event.url) {
        return [await enrichEventFromPage(event, pageUrl)];
      }
    } catch {
      return [normalizeEvent(event)];
    }
    return [normalizeEvent(event)];
  });

  return dedupeEvents(chunks.flat());
}

async function expandProductGroup(
  groupId: string,
  pageUrl: URL,
  detailUrl?: string | null
): Promise<EventimEvent[]> {
  const pageHref =
    absoluteUrl(detailUrl, pageUrl) ??
    `${pageUrl.origin}/eventseries/${groupId}`;

  const [apiEvents, pageDetail] = await Promise.all([
    fetchProductGroupEvents(groupId, pageUrl),
    fetchDetailPage(pageHref, pageUrl),
  ]);

  let dates = apiEvents;
  if (dates.length === 0) {
    dates = detailEventsToEvents(pageDetail.events, pageDetail.name);
  }
  if (dates.length === 0) {
    dates = await fetchComponentEvents(groupId, pageUrl);
  }
  if (dates.length === 0 && pageDetail.nextData) {
    dates = eventsFromUnknown(pageDetail.nextData, pageUrl.origin);
  }

  const cities = uniqueCities(
    dates.map((event) => event.city),
    dates.flatMap((event) => event.cities ?? []),
    pageDetail.cities
  );
  const hero =
    pageDetail.heroImage ??
    dates.find((event) => event.heroImage)?.heroImage ??
    dates.find((event) => event.image)?.image ??
    null;
  const fallbackName = pageDetail.name ?? dates[0]?.name ?? null;

  if (dates.length === 0) {
    if (!fallbackName && !hero && cities.length === 0) return [];
    return [
      normalizeEvent({
        name: fallbackName ?? "Event",
        date: pageDetail.date,
        image: hero,
        heroImage: hero,
        location: pageDetail.location,
        venue: pageDetail.venue,
        city: pageDetail.city ?? cities[0] ?? null,
        cities,
        url: pageHref,
        tourUrl: pageHref,
        productGroupId: groupId,
      }),
    ];
  }

  return dates.map((event) =>
    normalizeEvent({
      ...event,
      name: event.name || fallbackName || event.name,
      image: event.image ?? hero,
      heroImage: hero ?? event.heroImage ?? event.image,
      cities,
      url: event.url ?? pageHref,
      tourUrl: pageHref,
      productGroupId: groupId,
    })
  );
}

async function enrichEventFromPage(
  event: EventimEvent,
  pageUrl: URL
): Promise<EventimEvent> {
  const href = absoluteUrl(event.url, pageUrl);
  if (!href) return normalizeEvent(event);
  const detail = await fetchDetailPage(href, pageUrl);
  const cities = uniqueCities(event.cities, event.city, detail.cities, detail.city);
  const hero = detail.heroImage ?? event.heroImage ?? event.image;
  return normalizeEvent({
    ...event,
    name: event.name || detail.name || event.name,
    date: event.date ?? detail.date,
    image: event.image ?? hero,
    heroImage: hero,
    venue: event.venue ?? detail.venue,
    city: event.city ?? detail.city,
    location:
      event.location ??
      detail.location ??
      formatLocation(event.venue ?? detail.venue, event.city ?? detail.city),
    cities,
    url: href,
    tourUrl: event.tourUrl ?? href,
  });
}

async function fetchProductGroupEvents(
  groupId: string,
  pageUrl: URL
): Promise<EventimEvent[]> {
  const tld = pageUrl.hostname.split(".").pop()?.toLowerCase() ?? "de";
  const webId = WEB_IDS[tld] ?? WEB_IDS.de;
  const affiliate =
    pageUrl.searchParams.get("affiliate") ??
    pageUrl.searchParams.get("retail_partner");
  const base = new URLSearchParams({
    webId,
    language: tld === "de" || tld === "at" || tld === "ch" ? "de" : "en",
    page: "1",
    sort: "DateAsc",
    top: "50",
  });
  if (affiliate) base.set("retail_partner", affiliate);

  const keys = [
    "product_group_id",
    "product_group.product_group_id",
    "productGroupId",
  ];

  for (const key of keys) {
    const params = new URLSearchParams(base);
    params.set(key, groupId);
    try {
      const payload = await fetchEventimCollection(
        PRODUCTS_URL,
        params,
        pageUrl,
        AbortSignal.timeout(DETAIL_TIMEOUT_MS)
      );
      const events = parseEventimProducts(payload, pageUrl.origin);
      if (events.length > 0) return events;
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchComponentEvents(
  groupId: string,
  pageUrl: URL
): Promise<EventimEvent[]> {
  const urls = [
    `${pageUrl.origin}/component?esid=${groupId}`,
    `${pageUrl.origin}/eventseries/${groupId}/component?esid=${groupId}`,
  ];
  for (const url of urls) {
    const html = await fetchEventimHtml(url, pageUrl);
    if (!html) continue;
    const detail = parseEventimDetailHtml(html, url);
    const events = detailEventsToEvents(detail.events, detail.name);
    if (events.length > 0) return events;
  }
  return [];
}

async function fetchDetailPage(url: string, pageUrl: URL) {
  const html = await fetchEventimHtml(url, pageUrl);
  if (!html) {
    return parseEventimDetailHtml("", url);
  }
  return parseEventimDetailHtml(html, url);
}

async function fetchEventimHtml(
  url: string,
  pageUrl: URL
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        ...eventimHeaders(pageUrl),
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
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

export function parseEventimProducts(
  payload: unknown,
  origin = "https://www.eventim.de"
): EventimEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const lists = [record.products, record.productGroups, record.events];
  const events: EventimEvent[] = [];

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const event = parseEventimItem(raw, origin);
      if (event) events.push(event);
    }
  }
  return events;
}

function eventsFromUnknown(payload: unknown, origin: string): EventimEvent[] {
  const direct = parseEventimProducts(payload, origin);
  if (direct.length > 0) return direct;
  if (!payload || typeof payload !== "object") return [];

  const events: EventimEvent[] = [];
  const visit = (value: unknown, depth: number) => {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) {
      const parsed = parseEventimProducts({ products: value }, origin);
      if (parsed.length > 0) {
        events.push(...parsed);
        return;
      }
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      events.push(...parseEventimProducts(record, origin));
      for (const [key, nested] of Object.entries(record)) {
        if (
          key === "products" ||
          key === "productGroups" ||
          key === "events" ||
          key === "items" ||
          key === "results" ||
          key === "props" ||
          key === "pageProps" ||
          key === "data"
        ) {
          visit(nested, depth + 1);
        }
      }
    }
  };
  visit(payload, 0);
  return dedupeEvents(events);
}

function parseEventimItem(
  raw: unknown,
  origin: string
): EventimEvent | null {
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
  const image = imageFrom(product, live);
  const link = absoluteUrl(eventLink(product), new URL(origin));
  return normalizeEvent({
    name,
    date:
      asString(live?.startDate) ??
      asString(product.startDate) ??
      asString(product.eventDate),
    image,
    heroImage: image,
    location: formatLocation(venue, city),
    venue,
    city,
    cities: uniqueCities(city),
    url: link,
    tourUrl: link,
    productGroupId: productGroupIdFromProduct(product),
  });
}

export function eventimQueryFromUrl(pageUrl: URL): {
  city?: string;
  searchTerm?: string;
  productId?: string;
  productGroupId?: string;
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

  const groupId = productGroupIdFromUrl(pageUrl.toString());
  if (groupId) {
    return { productGroupId: groupId, affiliate: affiliate || undefined };
  }

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

function productGroupIdFromProduct(
  product: Record<string, unknown>
): string | null {
  return (
    asString(product.productGroupId) ??
    asString(product.product_group_id) ??
    asString(asRecord(product.productGroup)?.id) ??
    asString(asRecord(product.product_group)?.product_group_id) ??
    asString(asRecord(product.product_group)?.id)
  );
}

function detailEventsToEvents(
  rows: EventimDetailEvent[],
  fallbackName: string | null
): EventimEvent[] {
  const events: EventimEvent[] = [];
  for (const row of rows) {
    const name = row.name || fallbackName;
    if (!name) continue;
    events.push(
      normalizeEvent({
        name,
        date: row.date,
        image: row.image,
        heroImage: row.image,
        location: row.location ?? formatLocation(row.venue, row.city),
        venue: row.venue,
        city: row.city,
        cities: uniqueCities(row.city),
        url: row.url,
      })
    );
  }
  return events;
}

function normalizeEvent(event: EventimEvent): EventimEvent {
  const cities = uniqueCities(event.cities, event.city);
  return {
    name: event.name,
    date: event.date ?? null,
    image: event.image ?? event.heroImage ?? null,
    heroImage: event.heroImage ?? event.image ?? null,
    location:
      event.location ?? formatLocation(event.venue ?? null, event.city ?? null),
    venue: event.venue ?? null,
    city: event.city ?? cities[0] ?? null,
    cities,
    url: event.url ?? null,
    tourUrl: event.tourUrl ?? event.url ?? null,
    productGroupId: event.productGroupId ?? null,
  };
}

function dedupeEvents(events: EventimEvent[]): EventimEvent[] {
  const seen = new Set<string>();
  const out: EventimEvent[] = [];
  for (const event of events) {
    const key = [
      event.url ?? "",
      event.name,
      event.date ?? "",
      event.city ?? "",
      event.venue ?? "",
    ]
      .join("|")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalizeEvent(event));
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
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
    if (item && typeof item !== "object") continue;
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

function absoluteUrl(url: string | null | undefined, pageUrl: URL): string | null {
  if (!url) return null;
  try {
    return new URL(url, pageUrl.origin).toString();
  } catch {
    return url;
  }
}

function isAccessDenied(text: string): boolean {
  return /access denied|nicht erlaubt|permission to access/i.test(text);
}
