import JSZip from "jszip";

import {
  clamp,
  cmykToRgb,
  rgbToHex,
  type Cmyk,
  type Rgb,
} from "./color";

export type { Rgb, Cmyk } from "./color";

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

function readSpotInfo(
  obj: UnknownObject
): { book?: string; name: string } | null {
  const spotField = obj.spot;
  if (isObject(spotField)) {
    const name =
      typeof spotField.spotColorName === "string"
        ? spotField.spotColorName
        : typeof spotField.name === "string"
          ? spotField.name
          : typeof spotField.swatchName === "string"
            ? spotField.swatchName
            : null;
    if (!name) return null;
    const book =
      typeof spotField.bookName === "string"
        ? spotField.bookName
        : typeof spotField.book === "string"
          ? spotField.book
          : typeof spotField.library === "string"
            ? spotField.library
            : undefined;
    return { name, book };
  }
  return null;
}

// Eine "Representation" in CC-Libraries hat `mode` + `value`. Wir akzeptieren
// zusaetzlich flache Strukturen mit `colorSpace` oder direkten RGB/CMYK-Feldern.
// Laut Spec: { "color": { "mode": "CMYK", "value": {...}, "spot": {...} } }
function parseRepresentation(
  obj: UnknownObject
): NormalisedRepresentation | null {
  const modeRaw = normaliseMode(obj.mode ?? obj.colorSpace ?? obj.space);
  const value = obj.value;
  const spot = readSpotInfo(obj);

  if (!modeRaw) {
    // Ohne `mode` koennen wir keine zuverlaessige Repraesentation ableiten.
    // Ausnahme: `type: "spot"` mit `alternate`-Struktur (aelteres Format).
    if (obj.type === "spot" || obj.colorType === "spot") {
      const fallback = obj.alternate ?? obj.alternateValue;
      if (isObject(fallback)) {
        const inner = parseRepresentation(fallback);
        if (inner && spot) {
          return { ...inner, mode: "spot", spot };
        }
      }
    }
    return null;
  }

  const applySpot = (
    rep: NormalisedRepresentation
  ): NormalisedRepresentation =>
    spot ? { ...rep, mode: "spot", spot } : rep;

  if (modeRaw === "rgb" || modeRaw === "srgb") {
    const rgb = readRgbValue(value ?? obj);
    if (rgb) return applySpot({ mode: "rgb", rgb });
  }

  if (modeRaw === "cmyk") {
    const cmyk = readCmykValue(value ?? obj);
    if (cmyk)
      return applySpot({ mode: "cmyk", rgb: cmykToRgb(cmyk), cmyk });
  }

  if (modeRaw === "lab") {
    const lab = readLabValue(value ?? obj);
    if (lab)
      return applySpot({
        mode: "lab",
        rgb: labToRgb(lab.l, lab.a, lab.b),
        lab,
      });
  }

  if (modeRaw === "gray" || modeRaw === "grayscale") {
    const g = asNumber(
      isObject(value) ? value.g ?? value.gray ?? value.value : value
    );
    if (g !== null) {
      const v = normaliseRgbChannel(g);
      return applySpot({ mode: "gray", rgb: { r: v, g: v, b: v } });
    }
  }

  if (modeRaw === "hsb" || modeRaw === "hsv") {
    // HSB/HSV: h in 0-360, s/b in 0-1 oder 0-100
    const hsb = isObject(value) ? value : obj;
    const h = asNumber(hsb.h ?? hsb.hue);
    const sRaw = asNumber(hsb.s ?? hsb.saturation);
    const bRaw = asNumber(hsb.b ?? hsb.v ?? hsb.brightness);
    if (h !== null && sRaw !== null && bRaw !== null) {
      const s = sRaw > 1 ? sRaw / 100 : sRaw;
      const br = bRaw > 1 ? bRaw / 100 : bRaw;
      const c = br * s;
      const hp = (((h % 360) + 360) % 360) / 60;
      const x = c * (1 - Math.abs((hp % 2) - 1));
      let r1 = 0,
        g1 = 0,
        b1 = 0;
      if (hp < 1) [r1, g1, b1] = [c, x, 0];
      else if (hp < 2) [r1, g1, b1] = [x, c, 0];
      else if (hp < 3) [r1, g1, b1] = [0, c, x];
      else if (hp < 4) [r1, g1, b1] = [0, x, c];
      else if (hp < 5) [r1, g1, b1] = [x, 0, c];
      else [r1, g1, b1] = [c, 0, x];
      const m = br - c;
      const rgb: Rgb = {
        r: clamp(Math.round((r1 + m) * 255), 0, 255),
        g: clamp(Math.round((g1 + m) * 255), 0, 255),
        b: clamp(Math.round((b1 + m) * 255), 0, 255),
      };
      return applySpot({ mode: "rgb", rgb });
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

// CC-Library-Exports sind DCX/UCF-Container. Representations werden oft als
// reine UUID-Dateien ohne Extension gespeichert. Wir muessen deshalb jeden
// Entry potenziell als JSON betrachten und nicht nur `.json`-Dateien.
const MAX_TEXT_SIZE = 4 * 1024 * 1024; // 4 MiB pro Datei
const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "tiff",
  "tif",
  "svg",
  "pdf",
  "psd",
  "ai",
  "indd",
  "mp4",
  "mov",
  "webm",
  "zip",
  "otf",
  "ttf",
  "woff",
  "woff2",
  "eot",
  "icc",
  "icm",
]);

function looksBinary(name: string): boolean {
  const lastSegment = name.split("/").pop() ?? name;
  const dot = lastSegment.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = lastSegment.slice(dot + 1).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function tryJsonParse(text: string): unknown | null {
  const trimmed = text.trimStart();
  if (trimmed.length === 0) return null;
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
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

  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && !looksBinary(entry.name)
  );

  // 1. Alle Files laden und als JSON parsen (soweit moeglich).
  const parsedFiles: Array<{ path: string; data: unknown }> = [];
  for (const entry of entries) {
    let text: string;
    try {
      text = await entry.async("string");
    } catch {
      continue;
    }
    if (text.length > MAX_TEXT_SIZE) continue;
    const parsed = tryJsonParse(text);
    if (parsed === null) continue;
    parsedFiles.push({ path: entry.name, data: parsed });
  }

  // 2. Element-Manifeste einsammeln: mappe Representation-Path -> Element-Name.
  const nameByRefPath = new Map<string, string>();
  for (const { path, data } of parsedFiles) {
    collectElementNames(data, nameByRefPath, path);
  }

  // 3. Farben extrahieren. Wenn der Walker keinen Namen findet, den Namen aus
  // dem Element-Manifest verwenden, das auf diese Datei zeigt.
  for (const { path, data } of parsedFiles) {
    const fallbackName = findFallbackNameForPath(path, nameByRefPath);
    walkJson(data, [], (color) => {
      const key = colorKey(color);
      if (seen.has(key)) return;
      seen.add(key);
      const useFallback =
        (!color.name ||
          color.name === "Farbe" ||
          color.name.startsWith("Farbe")) &&
        fallbackName;
      if (useFallback) {
        colors.push({ ...color, name: fallbackName });
      } else {
        colors.push(color);
      }
    });
  }

  if (colors.length === 0) {
    if (parsedFiles.length === 0) {
      throw new Error(
        "Keine JSON-Daten im Archiv gefunden. Moeglicherweise liegt ein anderes Format vor."
      );
    }
    // Diagnosis: welche Top-Level-Strukturen wurden gefunden?
    const hints = new Set<string>();
    for (const { data } of parsedFiles) {
      collectHints(data, hints, 0);
      if (hints.size > 20) break;
    }
    const hintText = Array.from(hints).slice(0, 10).join(", ");
    throw new Error(
      `Keine Farb-Repraesentationen gefunden (${parsedFiles.length} JSON-Dateien geprueft).` +
        (hintText ? ` Gefundene Schluessel: ${hintText}.` : "")
    );
  }

  return colors;
}

function collectHints(
  data: unknown,
  hints: Set<string>,
  depth: number
): void {
  if (depth > 3) return;
  if (Array.isArray(data)) {
    for (const entry of data.slice(0, 5)) collectHints(entry, hints, depth + 1);
    return;
  }
  if (!isObject(data)) return;
  for (const key of Object.keys(data)) {
    hints.add(key);
    if (hints.size > 30) return;
  }
  for (const value of Object.values(data).slice(0, 10)) {
    collectHints(value, hints, depth + 1);
  }
}

function collectElementNames(
  data: unknown,
  map: Map<string, string>,
  originPath: string
): void {
  const stack: unknown[] = [data];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const entry of node) stack.push(entry);
      continue;
    }
    if (!isObject(node)) continue;

    const name = typeof node.name === "string" ? node.name.trim() : "";
    const representations = node.representations;
    if (name && Array.isArray(representations)) {
      for (const rep of representations) {
        if (!isObject(rep)) continue;
        const path =
          typeof rep.path === "string"
            ? rep.path
            : typeof rep.href === "string"
              ? rep.href
              : typeof rep.componentId === "string"
                ? rep.componentId
                : null;
        if (path) {
          map.set(normalisePath(path, originPath), name);
          map.set(path, name);
        }
      }
    }

    for (const value of Object.values(node)) stack.push(value);
  }
}

function normalisePath(refPath: string, originPath: string): string {
  // Relative Referenzen relativ zum Manifest aufloesen (best effort).
  if (refPath.startsWith("/")) return refPath.slice(1);
  const originDir = originPath.includes("/")
    ? originPath.slice(0, originPath.lastIndexOf("/") + 1)
    : "";
  return `${originDir}${refPath}`;
}

function findFallbackNameForPath(
  path: string,
  map: Map<string, string>
): string | undefined {
  if (map.has(path)) return map.get(path);
  // Manche Exports verwenden einen Komponenten-Ordner je Element; wir matchen
  // per Komponenten-ID (Dateiname ohne Extension oder letztes Pfadsegment).
  const segments = path.split("/").filter(Boolean);
  for (let i = segments.length; i > 0; i -= 1) {
    const subpath = segments.slice(0, i).join("/");
    if (map.has(subpath)) return map.get(subpath);
  }
  const lastSeg = segments[segments.length - 1];
  if (lastSeg && map.has(lastSeg)) return map.get(lastSeg);
  return undefined;
}
