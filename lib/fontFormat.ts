export type FontFormat = "woff2" | "woff" | "ttf" | "otf" | "eot";

const FORMAT_LABELS: Record<FontFormat, string> = {
  woff2: "WOFF2",
  woff: "WOFF",
  ttf: "TrueType",
  otf: "OpenType",
  eot: "EOT",
};

export function normalizeFontFormat(
  raw: string | undefined | null
): FontFormat | null {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().trim();
  if (cleaned === "woff2") return "woff2";
  if (cleaned === "woff") return "woff";
  if (cleaned === "truetype" || cleaned === "ttf") return "ttf";
  if (cleaned === "opentype" || cleaned === "otf") return "otf";
  if (cleaned === "embedded-opentype" || cleaned === "eot") return "eot";
  return null;
}

export function formatFromFilename(name: string): FontFormat | null {
  const ext = name.split(".").pop();
  if (!ext) return null;
  return normalizeFontFormat(ext);
}

export function formatLabel(format: string): string {
  const normalized = normalizeFontFormat(format);
  if (normalized) return FORMAT_LABELS[normalized];
  return format.toUpperCase();
}

export function mimeTypeForFormat(format: string): string {
  const normalized = normalizeFontFormat(format);
  switch (normalized) {
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "eot":
      return "application/vnd.ms-fontobject";
    default:
      return "application/octet-stream";
  }
}

export function cssFormatName(format: string): string {
  const normalized = normalizeFontFormat(format);
  switch (normalized) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    case "eot":
      return "embedded-opentype";
    default:
      return format;
  }
}
