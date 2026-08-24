import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { upgradeHeroForPublish } from "@/lib/eventim-artwork";
import type { GethypedEvent } from "@/lib/gethyped-map";

const BUCKETS = ["scraper-images", "brand-assets"];
const PREFIX = "scraper-heroes";
const CONCURRENCY = 6;

export type PreparedImages = {
  events: GethypedEvent[];
  withImage: number;
  upgraded: number;
  rehosted: number;
};

/**
 * image_url ist Pflicht für die Qualität bei GetHyped.
 * Artwork-Header hat Vorrang vor 222er-Teasern; fehlt das Bild,
 * wird es aus Rohdaten (heroImage, Name, Ticketlink) nachgezogen.
 */
export async function prepareGethypedImages(
  events: GethypedEvent[],
  onProgress?: (done: number, total: number) => void
): Promise<PreparedImages> {
  const jobs = new Map<string, { listing: string | null; extra: Extra }>();
  for (const event of events) {
    const extra = extraOf(event);
    const listing = extra.listing;
    const key = jobKey(listing, extra);
    if (!jobs.has(key)) jobs.set(key, { listing, extra });
  }

  const resolved = new Map<string, string | null>();
  let upgraded = 0;
  let rehosted = 0;
  const entries = [...jobs.entries()];
  let finished = 0;
  onProgress?.(0, entries.length);

  for (let index = 0; index < entries.length; index += CONCURRENCY) {
    await Promise.all(
      entries.slice(index, index + CONCURRENCY).map(async ([key, job]) => {
        const best = await upgradeHeroForPublish(job.listing, {
          name: job.extra.name,
          startsAt: job.extra.startsAt,
          ticketUrl: job.extra.ticketUrl,
          fetchPage: false,
          quick: false,
        });
        if (best && job.listing && best !== job.listing) upgraded += 1;
        const hosted = best ? await rehostImage(best) : null;
        if (hosted) {
          rehosted += 1;
          resolved.set(key, hosted);
        } else {
          resolved.set(key, best);
        }
        finished += 1;
        onProgress?.(finished, entries.length);
      })
    );
  }

  const next = events.map((event) => {
    const extra = extraOf(event);
    const imageUrl = resolved.get(jobKey(extra.listing, extra));
    if (!imageUrl) return event;
    return { ...event, image_url: imageUrl };
  });

  return {
    events: next,
    withImage: next.filter((event) => event.image_url).length,
    upgraded,
    rehosted,
  };
}

type Extra = {
  listing: string | null;
  name: string;
  startsAt: string;
  ticketUrl: string | null;
};

function extraOf(event: GethypedEvent): Extra {
  const raw = event.raw ?? {};
  return {
    listing:
      asText(raw.heroImage) ??
      asText(event.image_url) ??
      asText(raw.artworkImage) ??
      null,
    name: event.name,
    startsAt: event.start,
    ticketUrl: asText(raw.ticketUrl) ?? event.ticket_url ?? null,
  };
}

function jobKey(listing: string | null, extra: Extra): string {
  if (listing) return `img:${listing}`;
  return `meta:${extra.name}|${extra.ticketUrl ?? ""}|${extra.startsAt}`;
}

async function rehostImage(source: string): Promise<string | null> {
  const client = storageClient();
  if (!client) return null;
  const image = await fetchImageBytes(source);
  if (!image) return null;
  const ext = extensionOf(image.contentType, source);
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 32);
  const path = `${PREFIX}/${hash}.${ext}`;

  for (const bucket of BUCKETS) {
    const publicUrl = client.storage.from(bucket).getPublicUrl(path).data
      .publicUrl;
    if (publicUrl && (await remoteOk(publicUrl))) return publicUrl;

    const { error } = await client.storage.from(bucket).upload(path, image.body, {
      contentType: image.contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) continue;
    const uploaded = client.storage.from(bucket).getPublicUrl(path).data
      .publicUrl;
    if (uploaded) return uploaded;
  }
  return null;
}

function storageClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchImageBytes(
  url: string
): Promise<{ body: Uint8Array; contentType: string } | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: "https://www.eventim.de/",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength < 32) return null;
    return { body: buffer, contentType: contentType.split(";")[0]?.trim() ?? contentType };
  } catch {
    return null;
  }
}

async function remoteOk(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function extensionOf(contentType: string, url: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  const fromUrl = url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1];
  if (fromUrl) return fromUrl.toLowerCase() === "jpeg" ? "jpg" : fromUrl.toLowerCase();
  return "jpg";
}
