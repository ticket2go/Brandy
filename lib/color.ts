export type Rgb = { r: number; g: number; b: number };
export type Cmyk = { c: number; m: number; y: number; k: number };

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizeHex(input: string): string | null {
  const trimmed = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`.toUpperCase();
  }
  return null;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const value = normalized.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

export function cmykToRgb({ c, m, y, k }: Cmyk): Rgb {
  const cn = clamp(c, 0, 100) / 100;
  const mn = clamp(m, 0, 100) / 100;
  const yn = clamp(y, 0, 100) / 100;
  const kn = clamp(k, 0, 100) / 100;
  const r = 255 * (1 - cn) * (1 - kn);
  const g = 255 * (1 - mn) * (1 - kn);
  const b = 255 * (1 - yn) * (1 - kn);
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

export function cmykToHex(cmyk: Cmyk): string {
  return rgbToHex(cmykToRgb(cmyk));
}

export function hexToCmyk(hex: string): Cmyk | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToCmyk(rgb);
}

export function formatCmyk({ c, m, y, k }: Cmyk): string {
  return `C${c} M${m} Y${y} K${k}`;
}

export function formatRgb({ r, g, b }: Rgb): string {
  return `RGB ${r}, ${g}, ${b}`;
}

export function parseCmyk(input: string): Cmyk | null {
  const matches = Array.from(
    input.matchAll(/([CMYK])\s*([0-9]+(?:\.[0-9]+)?)/gi)
  );
  if (matches.length < 4) return null;
  const values: Partial<Cmyk> = {};
  for (const m of matches) {
    const key = m[1].toLowerCase() as keyof Cmyk;
    const num = clamp(parseFloat(m[2]), 0, 100);
    values[key] = num;
  }
  if (
    values.c === undefined ||
    values.m === undefined ||
    values.y === undefined ||
    values.k === undefined
  ) {
    return null;
  }
  return values as Cmyk;
}

export function parseRgb(input: string): Rgb | null {
  const nums = Array.from(input.matchAll(/-?\d+(?:\.\d+)?/g)).map((m) =>
    parseFloat(m[0])
  );
  if (nums.length < 3) return null;
  return {
    r: clamp(nums[0], 0, 255),
    g: clamp(nums[1], 0, 255),
    b: clamp(nums[2], 0, 255),
  };
}
