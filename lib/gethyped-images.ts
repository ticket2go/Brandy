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
 * GetHyped lädt image_url selbst herunter. Eventim-Teaser (222×222)
 * werden oft verworfen, und manche GetHyped-Server erreichen Eventim nicht.
 * Deshalb zuerst ein großes Artwork wählen und das Bild öffentlich ablegen.
 */
export async function prepareGethypedImages(
  events: GethypedEvent[]
): Promise<PreparedImages> {
  const originals = uniqueUrls(events.map((event) => event.image_url));
  const resolved = new Map<string, string>();
  let upgraded = 0;
  let rehosted = 0;

  for (let index = 0; index < originals.length; index += CONCURRENCY) {
    await Promise.all(
      originals.slice(index, index + CONCURRENCY).map(async (url) => {
        const best = (await upgradeHeroForPublish(url)) ?? url;
        if (best !== url) upgraded += 1;
        const hosted = await rehostImage(best);
        if (hosted) {
          rehosted += 1;
          resolved.set(url, hosted);
          return;
        }
        resolved.set(url, best);
      })
    );
  }

  const next = events.map((event) => {
    if (!event.image_url) return event;
    const imageUrl = resolved.get(event.image_url);
    return imageUrl ? { ...event, image_url: imageUrl } : event;
  });

  return {
    events: next,
    withImage: next.filter((event) => event.image_url).length,
    upgraded,
    rehosted,
  };
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

function uniqueUrls(values: Array<string | undefined>): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function extensionOf(contentType: string, url: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  const fromUrl = url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1];
  if (fromUrl) return fromUrl.toLowerCase() === "jpeg" ? "jpg" : fromUrl.toLowerCase();
  return "jpg";
}
