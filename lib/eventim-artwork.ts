import { pageHeroImage } from "@/lib/eventim-parse";

const ARTWORKS = "/obj/media/DE-eventim/teaser/artworks";
const TEASER_SIZES = ["1920x600", "1140x400", "800x450", "640x360"];
const MAX_CANDIDATES = 24;
const heroCache = new Map<string, string | null>();
const pageHeroCache = new Map<string, string | null>();

export function isListingThumb(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/_222x222\.(?:jpe?g|png|webp)$/i.test(url)) return true;
  const dim = url.match(/\/(?:teaser|galery)\/(\d{2,4})x(\d{2,4})\//i);
  if (!dim) return false;
  const width = Number(dim[1]);
  const height = Number(dim[2]);
  return width <= 400 && height <= 400;
}

export function withoutListingThumb(
  url: string | null | undefined
): string | null {
  if (!url || isListingThumb(url)) return null;
  return url;
}

type HeroExtra = {
  name?: string | null;
  startsAt?: string | null;
  ticketUrl?: string | null;
  fetchPage?: boolean;
  quick?: boolean;
};

export function heroImageCandidates(
  listing: string | null,
  extra?: HeroExtra
): string[] {
  const out: string[] = [];
  const add = (value: string | null | undefined) => {
    if (!value || isListingThumb(value) || out.includes(value)) return;
    out.push(value);
  };

  add(rewriteListingToArtwork(listing));
  for (const url of rewriteListingToTeasers(listing)) add(url);

  const origin = originOf(listing ?? extra?.ticketUrl ?? null);
  const years = yearsOf(listing, extra?.startsAt);
  const slugs = slugsOf(listing, extra?.name, extra?.ticketUrl);

  for (const year of years) {
    for (const slug of slugs.slice(0, 2)) {
      add(`${origin}${ARTWORKS}/${year}/${slug}-tickets-header.jpg`);
    }
  }
  for (const year of years.slice(0, 4)) {
    for (const slug of slugs.slice(0, 2)) {
      for (const size of TEASER_SIZES) {
        add(
          `${origin}/obj/media/DE-eventim/teaser/${size}/${year}/${slug}-tickets-${year}.jpg`
        );
      }
    }
  }
  for (const year of years) {
    for (const slug of slugs) {
      add(`${origin}${ARTWORKS}/${year}/${slug}-tickets-header.jpg`);
      add(`${origin}${ARTWORKS}/${year}/${slug}-header.jpg`);
    }
  }

  return out.slice(0, extra?.quick ? 8 : MAX_CANDIDATES);
}

export async function resolveHeroImage(
  listing: string | null,
  extra?: HeroExtra
): Promise<string | null> {
  const direct = withoutListingThumb(listing);
  if (direct) return direct;
  const cacheKey = `${listing ?? ""}|${extra?.name ?? ""}|${extra?.ticketUrl ?? ""}|${extra?.fetchPage !== false}|${extra?.quick === true}`;
  if (heroCache.has(cacheKey)) return heroCache.get(cacheKey) ?? null;

  const canRewrite = Boolean(listing && /\/teaser\/\d+x\d+\//i.test(listing));
  let found: string | null = null;
  if (canRewrite || extra?.quick !== true) {
    const candidates = heroImageCandidates(listing, extra);
    const batchSize = 6;
    for (let index = 0; index < candidates.length && !found; index += batchSize) {
      const batch = candidates.slice(index, index + batchSize);
      const hits = await Promise.all(batch.map((url) => imageExists(url)));
      const hit = hits.findIndex(Boolean);
      if (hit >= 0) found = batch[hit] ?? null;
    }
  }

  if (!found && extra?.fetchPage !== false) {
    found = await fetchEventPageHero(extra?.ticketUrl ?? null);
  }

  heroCache.set(cacheKey, found);
  return found;
}

export async function applyHeroImages(
  events: Array<{
    heroImage: string | null;
    name?: string | null;
    startsAt?: string | null;
    ticketUrl?: string | null;
  }>,
  onProgress?: (done: number, total: number) => void,
  options?: { fetchPages?: boolean; quick?: boolean }
): Promise<void> {
  const fetchPages = options?.fetchPages !== false;
  const quick = options?.quick === true;
  const jobs = new Map<string, HeroExtra & { listing: string | null }>();
  for (const event of events) {
    const key = jobKey(event);
    if (jobs.has(key)) continue;
    jobs.set(key, {
      listing: event.heroImage,
      name: event.name,
      startsAt: event.startsAt,
      ticketUrl: event.ticketUrl,
      fetchPage: fetchPages,
      quick,
    });
  }

  const resolved = new Map<string, string | null>();
  const listings = [...jobs.entries()];
  const concurrency = 6;
  let done = 0;
  onProgress?.(0, listings.length);
  for (let index = 0; index < listings.length; index += concurrency) {
    await Promise.all(
      listings.slice(index, index + concurrency).map(async ([key, job]) => {
        resolved.set(key, await resolveHeroImage(job.listing, job));
        done += 1;
        onProgress?.(done, listings.length);
      })
    );
  }

  for (const event of events) {
    event.heroImage =
      resolved.get(jobKey(event)) ??
      withoutListingThumb(event.heroImage);
  }
}

function jobKey(event: {
  heroImage: string | null;
  name?: string | null;
}): string {
  if (event.heroImage && !isListingThumb(event.heroImage)) {
    return event.heroImage;
  }
  return `name:${(event.name ?? "").trim().toLowerCase()}`;
}

function rewriteListingToArtwork(listing: string | null): string | null {
  if (!listing || !/\/teaser\/\d+x\d+\//i.test(listing)) return null;
  const artworks = listing.replace(/\/teaser\/\d+x\d+\//i, "/teaser/artworks/");
  const header = artworks.replace(
    /-tickets-\d+\.(jpe?g|png|webp)$/i,
    "-tickets-header.$1"
  );
  if (header !== artworks) return header;
  return artworks.replace(/-\d{4}\.(jpe?g|png|webp)$/i, "-header.$1");
}

function rewriteListingToTeasers(listing: string | null): string[] {
  if (!listing || !/\/teaser\/\d+x\d+\//i.test(listing)) return [];
  return TEASER_SIZES.map((size) =>
    listing.replace(/\/teaser\/\d+x\d+\//i, `/teaser/${size}/`)
  );
}

async function fetchEventPageHero(
  ticketUrl: string | null
): Promise<string | null> {
  if (!ticketUrl || !isEventimProductPage(ticketUrl)) return null;
  if (pageHeroCache.has(ticketUrl)) return pageHeroCache.get(ticketUrl) ?? null;

  let hero: string | null = null;
  if (typeof window !== "undefined") {
    try {
      const response = await fetch(
        `/api/scraper/page?url=${encodeURIComponent(ticketUrl)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as { hero?: string | null };
      hero = withoutListingThumb(payload.hero);
    } catch {
      hero = null;
    }
  } else {
    const html = await fetchEventimHtml(ticketUrl);
    hero = html ? withoutListingThumb(pageHeroImage(html, ticketUrl)) : null;
  }

  pageHeroCache.set(ticketUrl, hero);
  return hero;
}

export async function fetchEventimHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (/access denied|permission to access/i.test(body)) return null;
    return body;
  } catch {
    return null;
  }
}

export function isEventimProductPage(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      /(^|\.)eventim\.(de|at|ch|com)$/i.test(url.hostname) &&
      /^\/(event|artist|attraction|eventseries)\//i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function imageExists(url: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const response = await fetch(
        `/api/scraper/media-ok?url=${encodeURIComponent(url)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as { ok?: boolean };
      return payload.ok === true;
    } catch {
      return false;
    }
  }
  return probeRemoteImage(url);
}

async function probeRemoteImage(url: string): Promise<boolean> {
  const ok = await requestOk(url, "HEAD");
  if (ok !== null) return ok;
  return (await requestOk(url, "GET")) === true;
}

async function requestOk(
  url: string,
  method: "HEAD" | "GET"
): Promise<boolean | null> {
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: { accept: "image/*,*/*;q=0.8" },
    });
    if (method === "GET") {
      try {
        await response.body?.cancel();
      } catch {
        // Stream-Abbruch ist optional.
      }
    }
    if (response.ok) return true;
    if (method === "HEAD" && (response.status === 405 || response.status === 501)) {
      return null;
    }
    return false;
  } catch {
    return method === "HEAD" ? null : false;
  }
}

function slugsOf(
  listing: string | null,
  name?: string | null,
  ticketUrl?: string | null
): string[] {
  const slugs: string[] = [];
  const add = (value: string | null | undefined) => {
    const slug = slugify(value ?? "");
    if (slug.length > 2 && !slugs.includes(slug)) slugs.push(slug);
  };

  const cleaned = (name ?? "")
    .replace(/\s+\d{4}\s*$/, "")
    .replace(/\s+tickets?$/i, "")
    .trim();
  if (cleaned) {
    add(cleaned.split(/\s+[–—-]\s+/)[0]);
    add(cleaned.split(/[:–—|]/)[0]);
    const words = slugify(cleaned).split("-").filter(Boolean);
    if (words.length >= 2) add(words.slice(0, 2).join("-"));
    if (words.length >= 3) add(words.slice(0, 3).join("-"));
    add(cleaned);
  }
  add(name ?? "");

  const file = listing?.split("/").pop() ?? "";
  const mam = file.match(/^(.*?)(?:_\d+){1,2}_222x222\.(?:jpe?g|png|webp)$/i);
  if (mam?.[1]) {
    const base = mam[1].replace(/---+/g, "-").replace(/-tickets.*$/i, "");
    const words = slugify(base).split("-").filter(Boolean);
    if (words.length >= 2) add(words.slice(0, 2).join("-"));
    add(base);
  }

  const fromTeaser = listing?.match(
    /\/teaser\/[^/]+\/(?:\d{4}\/)?([^/]+?)-tickets-\d+\.(?:jpe?g|png|webp)$/i
  );
  if (fromTeaser?.[1]) add(fromTeaser[1]);

  const eventSlug = slugFromTicketUrl(ticketUrl);
  if (eventSlug) {
    const parts = eventSlug.split("-").filter(Boolean);
    if (parts.length >= 3) add(parts.slice(0, 3).join("-"));
    add(eventSlug);
  }

  return slugs;
}

function slugFromTicketUrl(ticketUrl: string | null | undefined): string | null {
  if (!ticketUrl) return null;
  try {
    const last =
      new URL(ticketUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    const slug = last.replace(/-\d{4,}$/, "");
    return slug.length > 2 ? slug : null;
  } catch {
    return null;
  }
}

function yearsOf(listing: string | null, startsAt?: string | null): string[] {
  const years: string[] = [];
  const add = (value: string | null | undefined) => {
    if (value && /^20\d{2}$/.test(value) && !years.includes(value)) {
      years.push(value);
    }
  };

  add(listing?.match(/\/(20\d{2})\//)?.[1]);
  const current = new Date().getFullYear();
  for (let year = current + 1; year >= current - 8; year -= 1) {
    add(String(year));
  }
  add(startsAt?.slice(0, 4));
  return years;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function originOf(listing: string | null): string {
  try {
    return listing ? new URL(listing).origin : "https://www.eventim.de";
  } catch {
    return "https://www.eventim.de";
  }
}
