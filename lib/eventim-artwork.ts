const LISTING_THUMB =
  /(?:\/(?:teaser|galery)\/\d{2,3}x\d{2,3}\/|_222x222\.(?:jpe?g|png|webp)$)/i;

const ARTWORKS = "/obj/media/DE-eventim/teaser/artworks";
const MAX_CANDIDATES = 24;
const heroCache = new Map<string, string | null>();

export function isListingThumb(url: string | null | undefined): boolean {
  return Boolean(url && LISTING_THUMB.test(url));
}

export function withoutListingThumb(
  url: string | null | undefined
): string | null {
  if (!url || isListingThumb(url)) return null;
  return url;
}

export function heroImageCandidates(
  listing: string | null,
  extra?: { name?: string | null; startsAt?: string | null }
): string[] {
  const out: string[] = [];
  const add = (value: string | null | undefined) => {
    if (!value || isListingThumb(value) || out.includes(value)) return;
    out.push(value);
  };

  add(rewriteListingToArtwork(listing));

  const origin = originOf(listing);
  const years = yearsOf(listing, extra?.startsAt);
  const slugs = slugsOf(listing, extra?.name);

  for (const year of years) {
    for (const slug of slugs.slice(0, 2)) {
      add(`${origin}${ARTWORKS}/${year}/${slug}-tickets-header.jpg`);
    }
  }
  for (const year of years) {
    for (const slug of slugs) {
      add(`${origin}${ARTWORKS}/${year}/${slug}-tickets-header.jpg`);
      add(`${origin}${ARTWORKS}/${year}/${slug}-header.jpg`);
    }
  }

  return out.slice(0, MAX_CANDIDATES);
}

export async function resolveHeroImage(
  listing: string | null,
  extra?: { name?: string | null; startsAt?: string | null }
): Promise<string | null> {
  const direct = withoutListingThumb(listing);
  if (direct) return direct;
  const cacheKey = `${listing ?? ""}|${extra?.name ?? ""}|${extra?.startsAt ?? ""}`;
  if (heroCache.has(cacheKey)) return heroCache.get(cacheKey) ?? null;

  const candidates = heroImageCandidates(listing, extra);
  let found: string | null = null;
  const batchSize = 6;
  for (let index = 0; index < candidates.length && !found; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const hits = await Promise.all(batch.map((url) => imageExists(url)));
    const hit = hits.findIndex(Boolean);
    if (hit >= 0) found = batch[hit] ?? null;
  }

  heroCache.set(cacheKey, found);
  return found;
}

export async function applyHeroImages(
  events: Array<{
    heroImage: string | null;
    name?: string | null;
    startsAt?: string | null;
  }>
): Promise<void> {
  const jobs = new Map<
    string,
    { listing: string | null; name?: string | null; startsAt?: string | null }
  >();
  for (const event of events) {
    const key = jobKey(event);
    if (jobs.has(key)) continue;
    jobs.set(key, {
      listing: event.heroImage,
      name: event.name,
      startsAt: event.startsAt,
    });
  }

  const resolved = new Map<string, string | null>();
  const listings = [...jobs.entries()];
  const concurrency = 6;
  for (let index = 0; index < listings.length; index += concurrency) {
    await Promise.all(
      listings.slice(index, index + concurrency).map(async ([key, job]) => {
        resolved.set(key, await resolveHeroImage(job.listing, job));
      })
    );
  }

  for (const event of events) {
    event.heroImage =
      resolved.get(jobKey(event)) ?? withoutListingThumb(event.heroImage);
  }
}

function jobKey(event: {
  heroImage: string | null;
  name?: string | null;
  startsAt?: string | null;
}): string {
  return `${event.heroImage ?? ""}|${event.name ?? ""}|${event.startsAt ?? ""}`;
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

function slugsOf(listing: string | null, name?: string | null): string[] {
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

  return slugs;
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
