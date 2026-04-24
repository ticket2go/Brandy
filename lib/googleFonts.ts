export type GoogleFontVariant = {
  variant: string;
  weight: number;
  italic: boolean;
  styleLabel: string;
};

export type GoogleFontFamily = {
  family: string;
  category: string;
  variants: GoogleFontVariant[];
};

const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

export function weightLabel(weight: number): string {
  return WEIGHT_LABELS[weight] ?? String(weight);
}

export function styleLabelFor(weight: number, italic: boolean): string {
  const base = weightLabel(weight);
  if (!italic) return base;
  if (weight === 400) return "Italic";
  return `${base} Italic`;
}

export function parseVariant(variant: string): GoogleFontVariant | null {
  const cleaned = variant.trim().toLowerCase();
  if (!cleaned) return null;
  if (cleaned === "regular") {
    return { variant: "regular", weight: 400, italic: false, styleLabel: "Regular" };
  }
  if (cleaned === "italic") {
    return { variant: "italic", weight: 400, italic: true, styleLabel: "Italic" };
  }
  const italicMatch = cleaned.match(/^(\d{3})italic$/);
  if (italicMatch) {
    const weight = parseInt(italicMatch[1], 10);
    return {
      variant: cleaned,
      weight,
      italic: true,
      styleLabel: styleLabelFor(weight, true),
    };
  }
  const weightMatch = cleaned.match(/^(\d{3})$/);
  if (weightMatch) {
    const weight = parseInt(weightMatch[1], 10);
    return {
      variant: cleaned,
      weight,
      italic: false,
      styleLabel: styleLabelFor(weight, false),
    };
  }
  return null;
}

type MetadataEntry = {
  family: string;
  category?: string;
  fonts?: Record<string, unknown>;
  subsets?: string[];
  axes?: Array<{ tag: string; min?: number; max?: number }>;
};

let cache: {
  fetchedAt: number;
  families: GoogleFontFamily[];
} | null = null;

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function parseMetadataJson(raw: string): MetadataEntry[] {
  const trimmed = raw.replace(/^\)\]\}'?/, "").trim();
  const parsed = JSON.parse(trimmed) as {
    familyMetadataList?: MetadataEntry[];
  };
  return parsed.familyMetadataList ?? [];
}

function variantsFromMetadata(entry: MetadataEntry): GoogleFontVariant[] {
  const variants = new Map<string, GoogleFontVariant>();
  const fonts = entry.fonts ?? {};
  for (const key of Object.keys(fonts)) {
    // keys look like "0,400" (italic,wght) or "1,700"
    const match = key.match(/^(\d),(\d{3})$/);
    if (!match) continue;
    const italic = match[1] === "1";
    const weight = parseInt(match[2], 10);
    const variant = italic
      ? weight === 400
        ? "italic"
        : `${weight}italic`
      : weight === 400
        ? "regular"
        : String(weight);
    if (variants.has(variant)) continue;
    variants.set(variant, {
      variant,
      weight,
      italic,
      styleLabel: styleLabelFor(weight, italic),
    });
  }

  if (variants.size === 0) {
    // Variable-Font-Familien ohne statische Varianten bekommen ein Default
    variants.set("regular", {
      variant: "regular",
      weight: 400,
      italic: false,
      styleLabel: "Regular",
    });
  }

  return Array.from(variants.values()).sort((a, b) => {
    if (a.weight !== b.weight) return a.weight - b.weight;
    return Number(a.italic) - Number(b.italic);
  });
}

export async function fetchGoogleFontsCatalog(): Promise<GoogleFontFamily[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.families;
  }

  const response = await fetch(
    "https://fonts.google.com/metadata/fonts",
    {
      next: { revalidate: 3600 },
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; BrandsystemBot/1.0; +https://brandsystem.local)",
      },
    } as RequestInit
  );

  if (!response.ok) {
    throw new Error(
      `Google-Fonts-Katalog konnte nicht geladen werden (Status ${response.status}).`
    );
  }

  const raw = await response.text();
  const entries = parseMetadataJson(raw);
  const families: GoogleFontFamily[] = entries.map((entry) => ({
    family: entry.family,
    category: entry.category ?? "",
    variants: variantsFromMetadata(entry),
  }));

  cache = { fetchedAt: now, families };
  return families;
}

export function searchFamilies(
  families: GoogleFontFamily[],
  query: string,
  limit = 20
): GoogleFontFamily[] {
  const q = query.trim().toLowerCase();
  if (!q) return families.slice(0, limit);
  const scored: Array<{ family: GoogleFontFamily; score: number }> = [];
  for (const family of families) {
    const name = family.family.toLowerCase();
    if (name === q) scored.push({ family, score: 0 });
    else if (name.startsWith(q)) scored.push({ family, score: 1 });
    else if (name.includes(q)) scored.push({ family, score: 2 });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.family.family.localeCompare(b.family.family);
  });
  return scored.slice(0, limit).map((entry) => entry.family);
}

export function findFamily(
  families: GoogleFontFamily[],
  name: string
): GoogleFontFamily | null {
  const target = name.trim().toLowerCase();
  for (const family of families) {
    if (family.family.toLowerCase() === target) return family;
  }
  return null;
}

export type FontFileDownload = {
  variant: string;
  weight: number;
  italic: boolean;
  styleLabel: string;
  format: string;
  contentType: string;
  base64: string;
};

export async function fetchGoogleFontFiles(
  family: string,
  variants: GoogleFontVariant[]
): Promise<FontFileDownload[]> {
  if (variants.length === 0) return [];

  const italSpecs = variants
    .filter((v) => v.italic)
    .map((v) => `1,${v.weight}`);
  const regularSpecs = variants
    .filter((v) => !v.italic)
    .map((v) => `0,${v.weight}`);
  const specs = [...regularSpecs, ...italSpecs].sort((a, b) => {
    // css2 API erwartet aufsteigend sortiert, zuerst ital=0, dann ital=1, jeweils nach wght
    const [ai, aw] = a.split(",").map(Number);
    const [bi, bw] = b.split(",").map(Number);
    if (ai !== bi) return ai - bi;
    return aw - bw;
  });

  const familyEncoded = encodeURIComponent(family);
  const url = `https://fonts.googleapis.com/css2?family=${familyEncoded}:ital,wght@${specs.join(";")}&display=swap`;

  const cssResponse = await fetch(url, {
    headers: {
      // Chrome-UA, damit Google die woff2-URLs ausliefert
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!cssResponse.ok) {
    throw new Error(
      `Google-Fonts-CSS konnte nicht geladen werden (Status ${cssResponse.status}).`
    );
  }

  const css = await cssResponse.text();
  const blocks = css.split("@font-face");
  const files: FontFileDownload[] = [];

  for (const block of blocks) {
    const styleMatch = block.match(/font-style:\s*([a-z]+)/i);
    const weightMatch = block.match(/font-weight:\s*(\d{3})/i);
    const urlMatch = block.match(/url\(([^)]+)\)\s*format\(([^)]+)\)/i);
    if (!styleMatch || !weightMatch || !urlMatch) continue;

    const italic = styleMatch[1].toLowerCase() === "italic";
    const weight = parseInt(weightMatch[1], 10);
    const requested = variants.find(
      (v) => v.weight === weight && v.italic === italic
    );
    if (!requested) continue;

    const fontUrl = urlMatch[1].replace(/['"]/g, "").trim();
    const format = urlMatch[2].replace(/['"]/g, "").trim();

    const binaryResponse = await fetch(fontUrl);
    if (!binaryResponse.ok) {
      throw new Error(
        `Schriftdatei konnte nicht heruntergeladen werden (Status ${binaryResponse.status}).`
      );
    }
    const buffer = Buffer.from(await binaryResponse.arrayBuffer());
    files.push({
      variant: requested.variant,
      weight: requested.weight,
      italic: requested.italic,
      styleLabel: requested.styleLabel,
      format,
      contentType: binaryResponse.headers.get("content-type") ?? "font/woff2",
      base64: buffer.toString("base64"),
    });
  }

  if (files.length === 0) {
    throw new Error(
      "Google Fonts hat keine passenden Schriftdateien zurueckgegeben."
    );
  }

  return files;
}
