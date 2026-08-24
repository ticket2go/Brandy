const LISTING_THUMB =
  /(?:\/(?:teaser|galery)\/\d{2,3}x\d{2,3}\/|_222x222\.(?:jpe?g|png|webp)$)/i;

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

export function heroImageCandidates(listing: string | null): string[] {
  if (!listing) return [];
  const out: string[] = [];
  const add = (value: string | null) => {
    if (!value || isListingThumb(value) || out.includes(value)) return;
    out.push(value);
  };

  if (/\/teaser\/\d+x\d+\//i.test(listing)) {
    const artworks = listing.replace(/\/teaser\/\d+x\d+\//i, "/teaser/artworks/");
    add(
      artworks.replace(
        /-tickets-\d+\.(jpe?g|png|webp)$/i,
        "-tickets-header.$1"
      )
    );
    add(artworks.replace(/-\d{4}\.(jpe?g|png|webp)$/i, "-header.$1"));
    add(artworks.replace(/\.(jpe?g|png|webp)$/i, "-header.$1"));
  }

  return out;
}

export async function resolveHeroImage(
  listing: string | null
): Promise<string | null> {
  const direct = withoutListingThumb(listing);
  if (direct) return direct;
  if (!listing) return null;
  if (heroCache.has(listing)) return heroCache.get(listing) ?? null;

  let found: string | null = null;
  for (const candidate of heroImageCandidates(listing)) {
    if (await imageExists(candidate)) {
      found = candidate;
      break;
    }
  }
  heroCache.set(listing, found);
  return found;
}

export async function applyHeroImages(
  events: Array<{ heroImage: string | null }>
): Promise<void> {
  const unique = [
    ...new Set(events.map((event) => event.heroImage).filter(Boolean)),
  ] as string[];
  const resolved = new Map<string, string | null>();
  const concurrency = 8;
  for (let index = 0; index < unique.length; index += concurrency) {
    await Promise.all(
      unique.slice(index, index + concurrency).map(async (url) => {
        resolved.set(url, await resolveHeroImage(url));
      })
    );
  }
  for (const event of events) {
    event.heroImage = event.heroImage
      ? resolved.get(event.heroImage) ?? withoutListingThumb(event.heroImage)
      : null;
  }
}

async function imageExists(url: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    return imageExistsInBrowser(url);
  }
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: { accept: "image/*,*/*;q=0.8" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function imageExistsInBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (ok: boolean) => {
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), 4000);
    image.onload = () => {
      window.clearTimeout(timer);
      finish(image.naturalWidth >= 400);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    image.src = url;
  });
}
