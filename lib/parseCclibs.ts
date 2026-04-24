import JSZip from "jszip";

import {
  clamp,
  cmykToRgb,
  rgbToHex,
  type Cmyk,
  type Rgb,
} from "./color";

export type CclibsColorMode = "rgb" | "cmyk" | "lab" | "gray" | "spot";

export type CclibsColor = {
  name: string;
  hex: string;
  rgb: Rgb;
  cmyk?: Cmyk;
  lab?: { l: number; a: number; b: number };
  spot?: { book?: string; name: string };
  mode: CclibsColorMode;
};

type UnknownObject = Record<string, unknown>;

function isObject(value: unknown): value is UnknownObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function normaliseRgbChannel(raw: number): number {
  if (raw <= 1) return clamp(Math.round(raw * 255), 0, 255);
  return clamp(Math.round(raw), 0, 255);
}

function readRgbValue(value: unknown): Rgb | null {
  if (isObject(value)) {
    const r = asNumber(value.r ?? value.red);
    const g = asNumber(value.g ?? value.green);
    const b = asNumber(value.b ?? value.blue);
    if (r !== null && g !== null && b !== null) {
      return {
        r: normaliseRgbChannel(r),
        g: normaliseRgbChannel(g),
        b: normaliseRgbChannel(b),
      };
    }
  }
  if (Array.isArray(value) && value.length >= 3) {
    const r = asNumber(value[0]);
    const g = asNumber(value[1]);
    const b = asNumber(value[2]);
    if (r !== null && g !== null && b !== null) {
      return {
        r: normaliseRgbChannel(r),
        g: normaliseRgbChannel(g),
        b: normaliseRgbChannel(b),
      };
    }
  }
  return null;
}

function normaliseCmykChannel(raw: number): number {
  if (raw <= 1) return clamp(Math.round(raw * 100), 0, 100);
  return clamp(Math.round(raw), 0, 100);
}

function readCmykValue(value: unknown): Cmyk | null {
  if (isObject(value)) {
    const c = asNumber(value.c ?? value.cyan);
    const m = asNumber(value.m ?? value.magenta);
    const y = asNumber(value.y ?? value.yellow);
    const k = asNumber(value.k ?? value.black ?? value.key);
    if (c !== null && m !== null && y !== null && k !== null) {
      return {
        c: normaliseCmykChannel(c),
        m: normaliseCmykChannel(m),
        y: normaliseCmykChannel(y),
        k: normaliseCmykChannel(k),
      };
    }
  }
  if (Array.isArray(value) && value.length >= 4) {
    const c = asNumber(value[0]);
    const m = asNumber(value[1]);
    const y = asNumber(value[2]);
    const k = asNumber(value[3]);
    if (c !== null && m !== null && y !== null && k !== null) {
      return {
        c: normaliseCmykChannel(c),
        m: normaliseCmykChannel(m),
        y: normaliseCmykChannel(y),
        k: normaliseCmykChannel(k),
      };
    }
  }
  return null;
}

function readLabValue(
  value: unknown
): { l: number; a: number; b: number } | null {
  if (isObject(value)) {
    const l = asNumber(value.l ?? value.L ?? value.lightness);
    const a = asNumber(value.a ?? value.A);
    const b = asNumber(value.b ?? value.B);
    if (l !== null && a !== null && b !== null) return { l, a, b };
  }
  if (Array.isArray(value) && value.length >= 3) {
    const l = asNumber(value[0]);
    const a = asNumber(value[1]);
    const b = asNumber(value[2]);
    if (l !== null && a !== null && b !== null) return { l, a, b };
  }
  return null;
}

// Approximative LAB -> sRGB Konvertierung (D65), ausreichend fuer Screen-Vorschau.
function labToRgb(l: number, a: number, b: number): Rgb {
  const y0 = (l + 16) / 116;
  const x0 = a / 500 + y0;
  const z0 = y0 - b / 200;
  const eps = 216 / 24389;
  const kappa = 24389 / 27;

  const fInv = (t: number) =>
    Math.pow(t, 3) > eps ? Math.pow(t, 3) : (116 * t - 16) / kappa;

  const xr = fInv(x0);
  const yr = l > 8 ? Math.pow(y0, 3) : l / kappa;
  const zr = fInv(z0);

  const X = xr * 0.95047;
  const Y = yr * 1.0;
  const Z = zr * 1.08883;

  let r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  let g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  let bl = X * 0.0557 + Y * -0.204 + Z * 1.057;

  const gamma = (c: number) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  r = gamma(r);
  g = gamma(g);
  bl = gamma(bl);

  return {
    r: clamp(Math.round(r * 255), 0, 255),
    g: clamp(Math.round(g * 255), 0, 255),
    b: clamp(Math.round(bl * 255), 0, 255),
  };
}

type NormalisedRepresentation = {
  mode: CclibsColorMode;
  rgb: Rgb;
  cmyk?: Cmyk;
  lab?: { l: number; a: number; b: number };
  spot?: { book?: string; name: string };
};

function normaliseMode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toLowerCase();
}

// Eine "Representation" in CC-Libraries hat `mode` + `value`. Wir akzeptieren
// zusaetzlich flache Strukturen mit `colorSpace` oder direkten RGB/CMYK-Feldern.
function parseRepresentation(
  obj: UnknownObject
): NormalisedRepresentation | null {
  const modeRaw = normaliseMode(obj.mode ?? obj.colorSpace ?? obj.space);
  const value = obj.value;

  if (modeRaw === "rgb" || modeRaw === "srgb") {
    const rgb = readRgbValue(value ?? obj);
    if (rgb) return { mode: "rgb", rgb };
  }

  if (modeRaw === "cmyk") {
    const cmyk = readCmykValue(value ?? obj);
    if (cmyk) return { mode: "cmyk", rgb: cmykToRgb(cmyk), cmyk };
  }

  if (modeRaw === "lab") {
    const lab = readLabValue(value ?? obj);
    if (lab) return { mode: "lab", rgb: labToRgb(lab.l, lab.a, lab.b), lab };
  }

  if (modeRaw === "gray" || modeRaw === "grayscale") {
    const g = asNumber(
      isObject(value) ? value.g ?? value.gray ?? value.value : value
    );
    if (g !== null) {
      const v = normaliseRgbChannel(g);
      return { mode: "gray", rgb: { r: v, g: v, b: v } };
    }
  }

  if (obj.type === "spot" || obj.colorType === "spot") {
    const name =
      typeof obj.swatchName === "string"
        ? obj.swatchName
        : typeof obj.name === "string"
          ? obj.name
          : "";
    const book = typeof obj.book === "string" ? obj.book : undefined;
    const alternate = obj.alternate ?? obj.alternateValue;
    if (isObject(alternate)) {
      const inner = parseRepresentation(alternate);
      if (inner)
        return {
          ...inner,
          mode: "spot",
          spot: { book, name },
        };
    }
  }

  return null;
}

function findNearestName(ancestry: UnknownObject[]): string {
  for (let i = ancestry.length - 1; i >= 0; i -= 1) {
    const node = ancestry[i];
    const name = node.name;
    if (typeof name === "string" && name.trim().length > 0) return name.trim();
  }
  return "";
}

function walkJson(
  node: unknown,
  ancestry: UnknownObject[],
  collect: (color: CclibsColor) => void
): void {
  if (Array.isArray(node)) {
    for (const entry of node) walkJson(entry, ancestry, collect);
    return;
  }
  if (!isObject(node)) return;

  const nextAncestry = [...ancestry, node];

  const rep = parseRepresentation(node);
  if (rep) {
    const spotName = rep.spot?.name;
    const name = spotName && spotName.trim()
      ? spotName.trim()
      : findNearestName(nextAncestry) || "Farbe";
    collect({
      name,
      hex: rgbToHex(rep.rgb),
      rgb: rep.rgb,
      cmyk: rep.cmyk,
      lab: rep.lab,
      spot: rep.spot,
      mode: rep.mode,
    });
    // Kein early return: es kann geschachtelte Reps geben (z.B. spot.alternate),
    // aber die sind bereits von parseRepresentation konsumiert. Wir ueberspringen
    // darum Representations-Arrays innerhalb dieses Knotens.
    if (Array.isArray(node.representations)) {
      for (const sibling of node.representations) {
        if (sibling === node) continue;
        walkJson(sibling, nextAncestry, collect);
      }
    }
    return;
  }

  for (const value of Object.values(node)) {
    walkJson(value, nextAncestry, collect);
  }
}

function colorKey(color: CclibsColor): string {
  const base = color.hex.toUpperCase();
  if (color.spot) return `spot:${color.spot.name}|${base}`;
  if (color.cmyk)
    return `cmyk:${color.cmyk.c}-${color.cmyk.m}-${color.cmyk.y}-${color.cmyk.k}`;
  return `rgb:${base}`;
}

export async function parseCclibsFile(file: File): Promise<CclibsColor[]> {
  if (file.size === 0) throw new Error("Datei ist leer.");
  // CC-Library-Exports kommen mit .cclibs oder .cclib; beide sind ZIP-Container.
  const buffer = await file.arrayBuffer();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(
      "Datei konnte nicht gelesen werden. Erwartet wird ein .cclibs / .cclib-Export."
    );
  }

  const colors: CclibsColor[] = [];
  const seen = new Set<string>();

  const jsonEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /\.json$/i.test(entry.name)
  );

  for (const entry of jsonEntries) {
    let text: string;
    try {
      text = await entry.async("string");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    walkJson(parsed, [], (color) => {
      const key = colorKey(color);
      if (seen.has(key)) return;
      seen.add(key);
      colors.push(color);
    });
  }

  return colors;
}
