import { absolute, parseEventimPage } from "@/lib/eventim-parse";
import {
  combineLocation,
  dedupeEvents,
  formatDate,
  formatPrice,
  formatTime,
  sortEvents,
  type ScrapedEvent,
} from "@/lib/scraped-event";

export type ScrapeResult = {
  events: ScrapedEvent[];
  warning: string | null;
};

type SearchHit = {
  name: string;
  productGroupId: string | null;
  followUpUrl: string | null;
  image: string | null;
};

const PRODUCTS_URL =
  "https://public-api.eventim.com/websearch/search/api/exploration/v1/products";
const PRODUCT_GROUPS_URL =
  "https://public-api.eventim.com/websearch/search/api/exploration/v2/productGroups";

const WEB_IDS: Record<string, string> = {
  de: "web__eventim-de",
  at: "web__eventim-at",
  ch: "web__eventim-ch",
};

const REQUEST_TIMEOUT_MS = 9000;
const MAX_HITS = 25;
const FOLLOW_UP_CONCURRENCY = 3;

export function isEventimUrl(rawUrl: string): boolean {
  try {
    return /(^|\.)eventim\.(de|at|ch|com)$/i.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

export async function scrapeEventim(rawUrl: string): Promise<ScrapeResult> {
  const pageUrl = new URL(rawUrl);
  let hits: SearchHit[] = [];
  let searchError: Error | null = null;

  try {
    hits = await fetchSearchHits(pageUrl);
  } catch (error) {
    searchError = error instanceof Error ? error : new Error(String(error));
  }

  if (hits.length === 0) {
    hits = await fetchSearchHitsFromHtml(pageUrl);
  }

  if (hits.length === 0) {
    if (searchError) throw searchError;
    return {
      events: [],
      warning: "Zu diesem Link wurden keine Einträge gefunden.",
    };
  }

  const chunks = await mapPool(
    hits.slice(0, MAX_HITS),
    FOLLOW_UP_CONCURRENCY,
    (hit) => fetchFollowUpEvents(hit, pageUrl)
  );

  const events = sortEvents(dedupeEvents(chunks.flat())).map(withDisplayFields);
  return {
    events,
    warning:
      events.length === 0
        ? "Die Folgeseiten haben keine Termine geliefert."
        : null,
  };
}

async function fetchSearchHits(pageUrl: URL): Promise<SearchHit[]> {
  const searchTerm = searchTermOf(pageUrl);
  const params = baseParams(pageUrl);
  params.set("sort", "Recommendation");
  if (searchTerm) params.set("search_term", searchTerm);

  const groups = await fetchJson(PRODUCT_GROUPS_URL, params, pageUrl);
  const hits = hitsFromPayload(groups, pageUrl.origin);
  if (hits.length > 0) return hits;

  const products = await fetchJson(PRODUCTS_URL, params, pageUrl);
  return hitsFromPayload(products, pageUrl.origin);
}

async function fetchSearchHitsFromHtml(pageUrl: URL): Promise<SearchHit[]> {
  const html = await fetchHtml(pageUrl.toString(), pageUrl);
  if (!html) return [];
  const parsed = parseEventimPage(html, pageUrl.toString());
  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  for (const link of parsed.productLinks) {
    const groupId = productGroupIdFromLink(link);
    const key = groupId ?? link;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      name: parsed.title ?? "Event",
      productGroupId: groupId,
      followUpUrl: link,
      image: parsed.heroImage,
    });
  }
  return hits.slice(0, MAX_HITS);
}

function productGroupIdFromLink(link: string): string | null {
  try {
    const segments = new URL(link).pathname.split("/").filter(Boolean);
    const type = segments[0]?.toLowerCase();
    if (type === "eventseries") return segments[1]?.match(/^\d{4,}$/)?.[0] ?? null;
    if (type === "artist" || type === "attraction") {
      const last = segments[segments.length - 1] ?? "";
      return last.match(/-(\d{4,})$/)?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function hitsFromPayload(payload: unknown, origin: string): SearchHit[] {
  const record = asRecord(payload);
  if (!record) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  for (const list of [record.productGroups, record.products, record.events]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const item = asRecord(raw);
      if (!item) continue;
      const name = asString(item.name) ?? asString(item.title);
      if (!name) continue;
      const productGroupId =
        asString(item.productGroupId) ??
        asString(asRecord(item.productGroup)?.id) ??
        asString(item.id);
      const link = absolute(linkOf(item), origin);
      const key = productGroupId ?? link ?? name;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        name,
        productGroupId,
        followUpUrl: link,
        image: absolute(imageOf(item), origin),
      });
    }
  }
  return hits;
}

async function fetchFollowUpEvents(
  hit: SearchHit,
  pageUrl: URL
): Promise<ScrapedEvent[]> {
  const [apiEvents, pageEvents] = await Promise.all([
    hit.productGroupId
      ? fetchProductGroupEvents(hit.productGroupId, pageUrl)
      : Promise.resolve([]),
    fetchFollowUpPage(hit, pageUrl),
  ]);

  const merged = mergeByTermin(apiEvents, pageEvents);
  const withHero = merged.map((event) => ({
    ...event,
    name: event.name || hit.name,
    heroImage: event.heroImage ?? pageEvents.heroImage ?? hit.image,
  }));

  if (withHero.length > 0) return withHero;
  if (!pageEvents.heroImage && !hit.image) return [];
  return [];
}

type FollowUpPage = {
  events: ScrapedEvent[];
  heroImage: string | null;
};

async function fetchFollowUpPage(
  hit: SearchHit,
  pageUrl: URL
): Promise<FollowUpPage> {
  const visited = new Set<string>();
  const queue: string[] = [];
  if (hit.followUpUrl) queue.push(hit.followUpUrl);
  if (hit.productGroupId) {
    queue.push(`${pageUrl.origin}/component?esid=${hit.productGroupId}`);
  }

  let heroImage: string | null = null;
  const events: ScrapedEvent[] = [];

  while (queue.length > 0 && visited.size < 4) {
    const next = queue.shift();
    if (!next || visited.has(next)) continue;
    visited.add(next);

    const html = await fetchHtml(next, pageUrl);
    if (!html) continue;
    const parsed = parseEventimPage(html, next);
    heroImage = heroImage ?? parsed.heroImage;
    events.push(...parsed.events);

    if (parsed.followUpUrl && !visited.has(parsed.followUpUrl)) {
      queue.push(parsed.followUpUrl);
    }
  }

  return { events: dedupeEvents(events), heroImage };
}

async function fetchProductGroupEvents(
  groupId: string,
  pageUrl: URL
): Promise<ScrapedEvent[]> {
  const keys = ["product_group_id", "product_group.product_group_id", "productGroupId"];
  for (const key of keys) {
    const params = baseParams(pageUrl);
    params.set("sort", "DateAsc");
    params.set(key, groupId);
    try {
      const payload = await fetchJson(PRODUCTS_URL, params, pageUrl);
      const events = eventsFromProducts(payload, pageUrl.origin);
      if (events.length > 0) return events;
    } catch {
      continue;
    }
  }
  return [];
}

function eventsFromProducts(payload: unknown, origin: string): ScrapedEvent[] {
  const record = asRecord(payload);
  if (!Array.isArray(record?.products)) return [];
  const events: ScrapedEvent[] = [];

  for (const raw of record.products) {
    const product = asRecord(raw);
    if (!product) continue;
    const name = asString(product.name) ?? asString(product.title);
    if (!name) continue;
    const live = asRecord(nested(product, ["typeAttributes", "liveEntertainment"]));
    const place = asRecord(live?.location) ?? asRecord(product.venue);
    const venue = asString(place?.name);
    const city = asString(place?.city);
    const startsAt = asString(live?.startDate) ?? asString(product.startDate);

    events.push({
      name,
      venue,
      city,
      location: combineLocation(venue, city),
      date: null,
      time: null,
      startsAt,
      heroImage: absolute(imageOf(product), origin),
      ticketUrl: absolute(linkOf(product), origin),
      price: priceOf(product),
    });
  }
  return events;
}

function priceOf(product: Record<string, unknown>): string | null {
  const from = asNumber(
    nested(product, ["priceRange", "min"]) ??
      nested(product, ["price", "min"]) ??
      product.minPrice ??
      product.priceFrom
  );
  const to = asNumber(
    nested(product, ["priceRange", "max"]) ??
      nested(product, ["price", "max"]) ??
      product.maxPrice
  );
  const currency =
    asString(nested(product, ["priceRange", "currency"])) ??
    asString(nested(product, ["price", "currency"])) ??
    asString(product.currency);
  return formatPrice(from, to, currency);
}

function mergeByTermin(
  primary: ScrapedEvent[],
  fallback: FollowUpPage
): ScrapedEvent[] {
  if (primary.length === 0) return fallback.events;

  const extras = new Map<string, ScrapedEvent>();
  for (const event of fallback.events) {
    extras.set(terminKey(event), event);
  }

  const merged = primary.map((event) => {
    const extra = extras.get(terminKey(event));
    if (!extra) return event;
    return {
      ...event,
      venue: event.venue ?? extra.venue,
      city: event.city ?? extra.city,
      location: event.location ?? extra.location,
      heroImage: event.heroImage ?? extra.heroImage,
      ticketUrl: event.ticketUrl ?? extra.ticketUrl,
      price: event.price ?? extra.price,
    };
  });

  const known = new Set(merged.map((event) => terminKey(event)));
  for (const event of fallback.events) {
    if (!known.has(terminKey(event))) merged.push(event);
  }
  return merged;
}

function terminKey(event: ScrapedEvent): string {
  return `${(event.startsAt ?? "").slice(0, 10)}|${(event.city ?? "").toLowerCase()}`;
}

function withDisplayFields(event: ScrapedEvent): ScrapedEvent {
  return {
    ...event,
    date: formatDate(event.startsAt),
    time: formatTime(event.startsAt),
    location: event.location ?? combineLocation(event.venue, event.city),
  };
}

function baseParams(pageUrl: URL): URLSearchParams {
  const tld = pageUrl.hostname.split(".").pop()?.toLowerCase() ?? "de";
  const params = new URLSearchParams({
    webId: WEB_IDS[tld] ?? WEB_IDS.de,
    language: tld === "de" || tld === "at" || tld === "ch" ? "de" : "en",
    page: "1",
    top: "50",
  });
  const affiliate =
    pageUrl.searchParams.get("affiliate") ??
    pageUrl.searchParams.get("retail_partner");
  if (affiliate) params.set("retail_partner", affiliate);
  const city = cityOf(pageUrl);
  if (city) params.set("city_names", city);
  return params;
}

function searchTermOf(pageUrl: URL): string | null {
  const term =
    pageUrl.searchParams.get("searchterm") ??
    pageUrl.searchParams.get("searchTerm") ??
    pageUrl.searchParams.get("search_term") ??
    pageUrl.searchParams.get("q");
  if (term?.trim()) return term.trim();
  return cityOf(pageUrl);
}

function cityOf(pageUrl: URL): string | null {
  const segments = pageUrl.pathname.split("/").filter(Boolean);
  if (segments[0]?.toLowerCase() !== "city" || !segments[1]) return null;
  const slug = decodeURIComponent(segments[1]).replace(/-\d+$/, "");
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchJson(
  endpoint: string,
  params: URLSearchParams,
  pageUrl: URL
): Promise<unknown> {
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: headers(pageUrl),
  });
  const body = await response.text();
  if (!response.ok || /access denied|permission to access/i.test(body)) {
    throw new Error(
      response.status === 403 || /access denied/i.test(body)
        ? "Eventim hat die Anfrage blockiert."
        : `Eventim API HTTP ${response.status}`
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("Eventim hat keine verwertbaren Daten geliefert.");
  }
}

async function fetchHtml(url: string, pageUrl: URL): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        ...headers(pageUrl),
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function headers(pageUrl: URL): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "de-DE,de;q=0.9,en;q=0.8",
    origin: pageUrl.origin,
    referer: `${pageUrl.origin}/`,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  };
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
      try {
        results[current] = await fn(items[current]);
      } catch {
        results[current] = [] as unknown as R;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

function linkOf(item: Record<string, unknown>): string | null {
  const direct = asString(item.link);
  if (direct) return direct;
  const url = item.url;
  if (typeof url === "string") return url;
  const holder = asRecord(url);
  if (!holder) return null;
  const path = asString(holder.path);
  const domain = asString(holder.domain);
  if (path && domain) return `${domain.replace(/\/$/, "")}${path}`;
  return path;
}

function imageOf(item: Record<string, unknown>): string | null {
  const direct =
    asString(item.imageUrl) ??
    asString(asRecord(item.image)?.url) ??
    asString(item.image);
  if (direct) return direct;
  const images = item.images;
  if (!Array.isArray(images)) return null;
  for (const entry of images) {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    const record = asRecord(entry);
    const url = asString(record?.url) ?? asString(record?.src);
    if (url) return url;
  }
  return null;
}

function nested(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
