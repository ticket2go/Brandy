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

type ListedEvent = ScrapedEvent & {
  productGroupId: string | null;
};

const PRODUCTS_URL =
  "https://public-api.eventim.com/websearch/search/api/exploration/v1/products";

const WEB_IDS: Record<string, string> = {
  de: "web__eventim-de",
  at: "web__eventim-at",
  ch: "web__eventim-ch",
};

const REQUEST_TIMEOUT_MS = 9000;
const PAGE_SIZE = 50;
const RANGE_CONCURRENCY = 4;
const DATE_RANGE_YEARS = 4;

export function isEventimUrl(rawUrl: string): boolean {
  try {
    return /(^|\.)eventim\.(de|at|ch|com)$/i.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

export async function scrapeEventim(rawUrl: string): Promise<ScrapeResult> {
  const pageUrl = new URL(rawUrl);
  let events: ScrapedEvent[] = [];
  let totalResults: number | null = null;
  let searchError: Error | null = null;

  try {
    const page = await fetchPageEvents(pageUrl);
    events = page.events;
    totalResults = page.totalResults;
  } catch (error) {
    searchError = error instanceof Error ? error : new Error(String(error));
  }

  if (events.length === 0) {
    events = await fetchEventsFromHtml(pageUrl);
  }

  if (events.length === 0) {
    if (searchError) throw searchError;
    return {
      events: [],
      warning: "Zu diesem Link wurden keine Einträge gefunden.",
    };
  }

  const unique = sortEvents(dedupeEvents(events)).map(withDisplayFields);
  return {
    events: unique,
    warning:
      totalResults != null && totalResults > unique.length
        ? `Es wurden ${unique.length} von ${totalResults} Einträgen der Seite geladen.`
        : null,
  };
}

export async function scrapeEventimFollowUps(
  events: ScrapedEvent[],
  rawUrl: string
): Promise<ScrapeResult> {
  if (events.length === 0) {
    return {
      events: [],
      warning: "Keine Einträge vorhanden. Bitte zuerst die Seite scrapen.",
    };
  }
  const pageUrl = new URL(rawUrl);
  const expanded = await expandFollowUpPages(events, pageUrl);
  return {
    events: sortEvents(dedupeEvents(expanded)).map(withDisplayFields),
    warning: null,
  };
}

async function fetchPageEvents(
  pageUrl: URL
): Promise<{ events: ScrapedEvent[]; totalResults: number | null }> {
  const groupId = productGroupIdFromLink(pageUrl.toString());
  if (groupId) {
    const keys = [
      "product_group_id",
      "product_group.product_group_id",
      "productGroupId",
    ];
    for (const key of keys) {
      try {
        const grouped = await fetchAllProductPages(pageUrl, (params) => {
          params.set("sort", "DateAsc");
          params.set(key, groupId);
        });
        if (grouped.events.length > 0) return grouped;
      } catch {
        continue;
      }
    }
  }

  const searchTerm = searchTermOf(pageUrl);
  if (searchTerm || cityOf(pageUrl) || isSearchPath(pageUrl)) {
    return fetchAllProductPages(pageUrl, (params) => {
      params.set("sort", "Recommendation");
      if (searchTerm) params.set("search_term", searchTerm);
    });
  }

  return { events: [], totalResults: null };
}

async function expandFollowUpPages(
  events: ScrapedEvent[],
  pageUrl: URL
): Promise<ScrapedEvent[]> {
  const grouped = new Map<string, ScrapedEvent[]>();
  const rest: ScrapedEvent[] = [];

  for (const event of events) {
    const listedId =
      (event as ListedEvent).productGroupId ??
      productGroupIdFromLink(event.ticketUrl ?? "");
    if (!listedId) {
      rest.push(withHeaderImage(event));
      continue;
    }
    const bucket = grouped.get(listedId) ?? [];
    bucket.push(event);
    grouped.set(listedId, bucket);
  }

  const limit = createLimiter(RANGE_CONCURRENCY);
  const chunks = await Promise.all(
    [...grouped.entries()].map(([groupId, originals]) =>
      limit(async () => {
        try {
          const follow = await fetchAllProductPages(pageUrl, (params) => {
            params.set("sort", "DateAsc");
            params.set("product_group_id", groupId);
          });
          if (follow.events.length > 1) {
            const header =
              headerImageFrom(originals[0]?.heroImage) ?? originals[0]?.heroImage;
            return follow.events.map((event) =>
              withHeaderImage(
                {
                  ...event,
                  name: event.name || originals[0]?.name || event.name,
                  heroImage: header ?? event.heroImage,
                },
                header
              )
            );
          }
        } catch {
          // Eintrag ohne Folgeseite behalten.
        }
        return originals.map((event) => withHeaderImage(event));
      })
    )
  );

  return [...rest, ...chunks.flat()];
}

function withHeaderImage(
  event: ScrapedEvent,
  header?: string | null
): ScrapedEvent {
  const next = header ?? headerImageFrom(event.heroImage) ?? event.heroImage;
  return next === event.heroImage ? event : { ...event, heroImage: next };
}

function headerImageFrom(listing: string | null): string | null {
  if (!listing) return null;
  if (!/\/teaser\/\d+x\d+\//i.test(listing)) return null;
  let next = listing.replace(/\/teaser\/\d+x\d+\//i, "/teaser/artworks/");
  if (/-tickets-\d+\.(jpe?g|png|webp)$/i.test(next)) {
    next = next.replace(/-tickets-\d+\.(jpe?g|png|webp)$/i, "-tickets-header.$1");
  } else {
    next = next.replace(/-\d{4}\.(jpe?g|png|webp)$/i, "-header.$1");
  }
  return next === listing ? null : next;
}

async function fetchEventsFromHtml(pageUrl: URL): Promise<ScrapedEvent[]> {
  const html = await fetchHtml(pageUrl.toString());
  if (!html) return [];
  const parsed = parseEventimPage(html, pageUrl.toString());
  if (parsed.events.length > 0) return parsed.events.map(withDisplayFields);

  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();
  for (const link of parsed.productLinks) {
    if (seen.has(link)) continue;
    seen.add(link);
    events.push(
      withDisplayFields({
        name: parsed.title ?? "Event",
        venue: null,
        city: null,
        location: null,
        date: null,
        time: null,
        startsAt: null,
        heroImage: parsed.heroImage,
        ticketUrl: link,
        price: null,
      })
    );
  }
  return events;
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

async function fetchAllProductPages(
  pageUrl: URL,
  apply: (params: URLSearchParams) => void
): Promise<{ events: ScrapedEvent[]; totalResults: number | null }> {
  const first = await fetchProductList(pageUrl, apply);
  if (
    first.totalResults == null ||
    first.totalResults <= first.events.length
  ) {
    return first;
  }

  const from = addDays(berlinDate(), -7);
  const to = addDays(from, DATE_RANGE_YEARS * 365);
  const limit = createLimiter(RANGE_CONCURRENCY);
  const paged = await walkDateRange(pageUrl, apply, from, to, limit);
  return {
    events: dedupeEvents([...first.events, ...paged]),
    totalResults: first.totalResults,
  };
}

async function fetchProductList(
  pageUrl: URL,
  apply: (params: URLSearchParams) => void,
  dates?: { from: string; to: string }
): Promise<{ events: ScrapedEvent[]; totalResults: number | null }> {
  const params = baseParams(pageUrl);
  params.set("page", "1");
  params.set("top", String(PAGE_SIZE));
  apply(params);
  if (dates) {
    params.set("sort", "DateAsc");
    params.set("date_from", dates.from);
    params.set("date_to", dates.to);
  }
  const payload = await fetchJson(PRODUCTS_URL, params, pageUrl);
  const record = asRecord(payload);
  return {
    events: eventsFromProducts(payload, pageUrl.origin),
    totalResults: asNumber(record?.totalResults),
  };
}

async function walkDateRange(
  pageUrl: URL,
  apply: (params: URLSearchParams) => void,
  from: string,
  to: string,
  limit: <T>(fn: () => Promise<T>) => Promise<T>
): Promise<ScrapedEvent[]> {
  const page = await limit(() => fetchProductList(pageUrl, apply, { from, to }));
  if (page.events.length === 0) return [];
  if (
    page.totalResults == null ||
    page.totalResults <= page.events.length ||
    from >= to
  ) {
    return page.events;
  }

  const mid = midDate(from, to);
  const next = addDays(mid === from ? from : mid, 1);
  if (next > to) return page.events;

  const [left, right] = await Promise.all([
    walkDateRange(pageUrl, apply, from, mid === from ? from : mid, limit),
    walkDateRange(pageUrl, apply, next, to, limit),
  ]);
  return [...left, ...right];
}

function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < max) {
        active += 1;
        resolve();
        return;
      }
      waiting.push(() => {
        active += 1;
        resolve();
      });
    });
  const release = () => {
    active = Math.max(0, active - 1);
    const next = waiting.shift();
    if (next) next();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

function berlinDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function midDate(from: string, to: string): string {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  return new Date((start + end) / 2).toISOString().slice(0, 10);
}

function eventsFromProducts(payload: unknown, origin: string): ListedEvent[] {
  const record = asRecord(payload);
  if (!Array.isArray(record?.products)) return [];
  const events: ListedEvent[] = [];

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
      productGroupId:
        asString(product.productGroupId) ??
        asString(asRecord(product.productGroup)?.id),
    });
  }
  return events;
}

function priceOf(product: Record<string, unknown>): string | null {
  const from = asNumber(
    typeof product.price === "number" ? product.price : undefined
  ) ??
    asNumber(
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
    top: String(PAGE_SIZE),
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

function isSearchPath(pageUrl: URL): boolean {
  return pageUrl.pathname.toLowerCase().includes("/search");
}

async function fetchJson(
  endpoint: string,
  params: URLSearchParams,
  pageUrl: URL
): Promise<unknown> {
  const { status, body } = await eventimGet(
    `${endpoint}?${params.toString()}`,
    apiHeaders(pageUrl)
  );
  if (status !== 200 || /access denied|permission to access/i.test(body)) {
    throw new Error(
      status === 403 || /access denied/i.test(body)
        ? "Eventim hat die Anfrage blockiert."
        : `Eventim API HTTP ${status}`
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("Eventim hat keine verwertbaren Daten geliefert.");
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const { status, body } = await eventimGet(url, pageHeaders(), 15000);
    if (status < 200 || status >= 300) return null;
    if (/access denied|permission to access/i.test(body)) return null;
    return body;
  } catch {
    return null;
  }
}

async function eventimGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    cache: "no-store",
    headers,
  });
  return { status: response.status, body: await response.text() };
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function apiHeaders(pageUrl: URL): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "accept-language": "de-DE,de;q=0.9,en;q=0.8",
  };
  if (typeof window !== "undefined") return headers;
  return {
    ...headers,
    ...clientHintHeaders(),
    origin: pageUrl.origin,
    referer: `${pageUrl.origin}/`,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
  };
}

function pageHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "de-DE,de;q=0.9,en;q=0.8",
  };
  if (typeof window !== "undefined") return headers;
  return {
    ...headers,
    ...clientHintHeaders(),
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
  };
}

function clientHintHeaders(): Record<string, string> {
  return {
    "sec-ch-ua": '"Chromium";v="128", "Not(A:Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "user-agent": USER_AGENT,
  };
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
