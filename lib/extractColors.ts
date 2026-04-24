import { clamp, rgbToHex } from "./color";

const MAX_CSS_FILES = 20;
const MAX_FETCH_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; BrandsystemColorExtractor/1.0; +https://brandsystem.app)";

// Teilmenge der CSS-Farbnamen. Deckt gaengige Brand-Faelle ab, ohne
// die komplette Spezifikation importieren zu muessen.
const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  lime: "#00FF00",
  blue: "#0000FF",
  yellow: "#FFFF00",
  cyan: "#00FFFF",
  aqua: "#00FFFF",
  magenta: "#FF00FF",
  fuchsia: "#FF00FF",
  silver: "#C0C0C0",
  gray: "#808080",
  grey: "#808080",
  maroon: "#800000",
  olive: "#808000",
  green: "#008000",
  purple: "#800080",
  teal: "#008080",
  navy: "#000080",
  orange: "#FFA500",
  gold: "#FFD700",
  pink: "#FFC0CB",
  brown: "#A52A2A",
  beige: "#F5F5DC",
  ivory: "#FFFFF0",
  indigo: "#4B0082",
  violet: "#EE82EE",
  turquoise: "#40E0D0",
  salmon: "#FA8072",
  crimson: "#DC143C",
  tomato: "#FF6347",
  coral: "#FF7F50",
  khaki: "#F0E68C",
};

function parseHexToken(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const [r, g, b] = cleaned.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{4}$/.test(cleaned)) {
    // RGBA-Kurzform: letztes Zeichen ist Alpha, ignorieren
    const [r, g, b] = cleaned.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{8}$/.test(cleaned)) {
    // RGBA 8-stellig: Alpha (letzte 2) ignorieren
    return `#${cleaned.slice(0, 6)}`.toUpperCase();
  }
  return null;
}

function parseNumber(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    const pct = parseFloat(trimmed.slice(0, -1));
    if (Number.isNaN(pct)) return NaN;
    return (pct / 100) * 255;
  }
  return parseFloat(trimmed);
}

function parseRgbFunction(args: string): string | null {
  // rgb(255, 0, 0) / rgb(255 0 0) / rgb(100%, 0%, 0%) / rgba(...) / rgb(255 0 0 / 0.5)
  const cleaned = args.replace(/\//g, ",");
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const r = parseNumber(parts[0]);
  const g = parseNumber(parts[1]);
  const b = parseNumber(parts[2]);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return rgbToHex({
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
  });
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const lit = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = lit - c / 2;
  return rgbToHex({
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  });
}

function parseHslFunction(args: string): string | null {
  const cleaned = args.replace(/\//g, ",");
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const hRaw = parts[0];
  let h = parseFloat(hRaw);
  if (hRaw.endsWith("turn")) h = parseFloat(hRaw) * 360;
  if (hRaw.endsWith("rad")) h = (parseFloat(hRaw) * 180) / Math.PI;
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  if ([h, s, l].some((n) => Number.isNaN(n))) return null;
  return hslToHex(h, s, l);
}

export type ColorHit = {
  hex: string;
  count: number;
  sources: Set<string>;
};

function addHit(map: Map<string, ColorHit>, hex: string, source: string) {
  const existing = map.get(hex);
  if (existing) {
    existing.count += 1;
    existing.sources.add(source);
    return;
  }
  map.set(hex, { hex, count: 1, sources: new Set([source]) });
}

export function extractColorsFromText(
  text: string,
  source: string,
  map: Map<string, ColorHit>
) {
  if (!text) return;

  // HEX
  const hexPattern = /#([0-9a-fA-F]{3,8})\b/g;
  let match: RegExpExecArray | null;
  while ((match = hexPattern.exec(text)) !== null) {
    const parsed = parseHexToken(match[1]);
    if (parsed) addHit(map, parsed, source);
  }

  // rgb(...)/rgba(...)
  const rgbPattern = /\brgba?\(([^)]+)\)/gi;
  while ((match = rgbPattern.exec(text)) !== null) {
    const parsed = parseRgbFunction(match[1]);
    if (parsed) addHit(map, parsed, source);
  }

  // hsl(...)/hsla(...)
  const hslPattern = /\bhsla?\(([^)]+)\)/gi;
  while ((match = hslPattern.exec(text)) !== null) {
    const parsed = parseHslFunction(match[1]);
    if (parsed) addHit(map, parsed, source);
  }

  // Benannte Farben (nur eigenstaendige Tokens)
  const namedPattern = new RegExp(
    `\\b(${Object.keys(NAMED_COLORS).join("|")})\\b`,
    "gi"
  );
  while ((match = namedPattern.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    const hex = NAMED_COLORS[key];
    if (hex) addHit(map, hex, source);
  }
}

async function fetchWithLimits(
  url: string,
  referer?: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "user-agent": USER_AGENT,
      accept: "text/html,text/css,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9,de;q=0.8",
    };
    if (referer) headers.referer = referer;

    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fuer ${url}`);
    }
    const reader = response.body?.getReader();
    if (!reader) return await response.text();

    const decoder = new TextDecoder();
    let received = 0;
    let result = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_FETCH_BYTES) {
        await reader.cancel();
        break;
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "0.0.0.0")
    return true;
  if (lower.endsWith(".local") || lower.endsWith(".localhost")) return true;
  if (lower === "::1" || lower === "[::1]") return true;
  // IPv4-Ranges
  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

export function validatePublicUrl(raw: string): string {
  if (!isHttpUrl(raw)) {
    throw new Error("Nur http/https-URLs werden unterstuetzt.");
  }
  const parsed = new URL(raw);
  if (isLikelyPrivateHost(parsed.hostname)) {
    throw new Error("Interne oder private Hosts sind nicht erlaubt.");
  }
  return parsed.toString();
}

export async function extractColorsFromWebsite(rawUrl: string) {
  const pageUrl = validatePublicUrl(rawUrl);
  const map = new Map<string, ColorHit>();

  const html = await fetchWithLimits(pageUrl);
  extractColorsFromText(html, "html", map);

  // <style>-Bloecke (auch ueber rohen HTML-Pass erfasst, aber gezielt weiterreichen)
  const styleBlocks = Array.from(
    html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)
  );
  for (const block of styleBlocks) {
    extractColorsFromText(block[1] ?? "", "inline-style", map);
  }

  // <link rel="stylesheet" href="...">
  const linkHrefs = new Set<string>();
  const linkPattern = /<link\b([^>]*?)\/?>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const attrs = linkMatch[1] ?? "";
    const rel = attrs.match(/\brel\s*=\s*["']?([^"'>\s]+)["']?/i)?.[1] ?? "";
    if (!/stylesheet/i.test(rel)) continue;
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const resolved = resolveUrl(pageUrl, href);
    if (resolved && isHttpUrl(resolved)) linkHrefs.add(resolved);
  }

  const cssUrls = Array.from(linkHrefs).slice(0, MAX_CSS_FILES);
  await Promise.all(
    cssUrls.map(async (cssUrl) => {
      try {
        if (isLikelyPrivateHost(new URL(cssUrl).hostname)) return;
        const cssText = await fetchWithLimits(cssUrl, pageUrl);
        extractColorsFromText(cssText, cssUrl, map);
      } catch {
        // Einzelne CSS-Fehler nicht propagieren
      }
    })
  );

  return map;
}

export type SerializedColor = {
  hex: string;
  count: number;
  sources: string[];
};

export function serializeColors(map: Map<string, ColorHit>): SerializedColor[] {
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
    .map((c) => ({ hex: c.hex, count: c.count, sources: Array.from(c.sources) }));
}
