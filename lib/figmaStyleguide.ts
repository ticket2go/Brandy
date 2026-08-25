import { rgbToHex } from "./color";
import { parseFigmaFileKey } from "./figmaUrl";

// Port des FigmaStyleguideImporter aus laravel-brandy: liest ueber die
// offizielle Figma-REST-API die publizierten Farb- und Text-Styles einer
// Datei. Gibt es keine Farb-Styles, dienen die meistgenutzten Fuellfarben
// als Fallback.

const FETCH_TIMEOUT_MS = 60_000;
const FALLBACK_POOL = 12;
const FALLBACK_MAX = 6;

export type FigmaStyleColor = { name: string; hex: string; count?: number };
export type FigmaFontInfo = { family: string; weights: string[] };

export type FigmaStyleguide = {
  colors: FigmaStyleColor[];
  fonts: FigmaFontInfo[];
  // "styles" = publizierte Farb-Styles, "fills" = Haeufigkeits-Fallback
  source: "styles" | "fills";
};

export class FigmaImportError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "FigmaImportError";
    this.status = status;
  }
}

type FigmaPaint = {
  type?: string;
  visible?: boolean;
  color?: { r?: number; g?: number; b?: number };
};

type FigmaNode = {
  type?: string;
  fills?: FigmaPaint[];
  styles?: { fill?: string; text?: string };
  style?: { fontFamily?: string; fontWeight?: number; italic?: boolean };
  children?: FigmaNode[];
};

export type FigmaFile = {
  document?: FigmaNode;
  styles?: Record<string, { styleType?: string; name?: string }>;
};

export async function fetchFigmaFile(
  fileKey: string,
  token: string
): Promise<FigmaFile> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: { "X-Figma-Token": token },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new FigmaImportError(
        "Zeitueberschreitung beim Laden der Figma-Datei. Sehr grosse Dateien werden von der Figma-API nur langsam ausgeliefert."
      );
    }
    throw new FigmaImportError("Figma-API nicht erreichbar.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 403) {
    throw new FigmaImportError(
      "Figma hat den Token abgelehnt. Bitte Token pruefen.",
      403
    );
  }
  if (response.status === 404) {
    throw new FigmaImportError(
      "Datei nicht gefunden. Hat dein Figma-Account Zugriff auf diese Datei?",
      404
    );
  }
  if (response.status === 429) {
    throw new FigmaImportError(
      "Figma-Rate-Limit erreicht. Bitte kurz warten und erneut versuchen.",
      429
    );
  }
  if (!response.ok) {
    throw new FigmaImportError(
      `Figma-API-Fehler (${response.status}).`,
      response.status
    );
  }

  const file = (await response.json().catch(() => null)) as FigmaFile | null;
  if (!file || typeof file !== "object") {
    throw new FigmaImportError("Figma-API lieferte keine lesbare Antwort.");
  }
  return file;
}

function solidFillHex(node: FigmaNode): string | null {
  for (const fill of node.fills ?? []) {
    if (fill.type !== "SOLID" || fill.visible === false) continue;
    const c = fill.color;
    if (typeof c?.r !== "number") return null;
    return rgbToHex({
      r: c.r * 255,
      g: (c.g ?? 0) * 255,
      b: (c.b ?? 0) * 255,
    });
  }
  return null;
}

// "Brand/Primary" -> "Primary" (letztes Segment eines Figma-Style-Pfads)
export function shortName(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1].trim();
}

export function weightName(weight: number, italic: boolean): string {
  let name: string;
  if (weight <= 200) name = "ExtraLight";
  else if (weight <= 300) name = "Light";
  else if (weight <= 400) name = "Regular";
  else if (weight <= 500) name = "Medium";
  else if (weight <= 600) name = "SemiBold";
  else if (weight <= 700) name = "Bold";
  else name = "Black";
  return italic ? `${name} Italic` : name;
}

export function extractStyleguide(file: FigmaFile): FigmaStyleguide {
  const fillStyles = new Map<string, string>();
  const textStyles = new Map<
    string,
    { family: string; weight: number; italic: boolean }
  >();
  const fillUsage = new Map<string, number>();

  // Iterativ statt rekursiv, damit sehr tiefe Dateien nicht den Stack sprengen.
  // Kinder werden rueckwaerts gepusht, um die Dokument-Reihenfolge (pre-order)
  // des Originals beizubehalten.
  const stack: FigmaNode[] = file.document ? [file.document] : [];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const hex = solidFillHex(node);
    if (hex) {
      fillUsage.set(hex, (fillUsage.get(hex) ?? 0) + 1);
      const styleId = node.styles?.fill;
      if (styleId && !fillStyles.has(styleId)) {
        fillStyles.set(styleId, hex);
      }
    }
    const textStyleId = node.styles?.text;
    if (node.type === "TEXT" && textStyleId && !textStyles.has(textStyleId)) {
      const s = node.style ?? {};
      if (s.fontFamily) {
        textStyles.set(textStyleId, {
          family: s.fontFamily,
          weight: Math.trunc(s.fontWeight ?? 400),
          italic: Boolean(s.italic),
        });
      }
    }
    const children = node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }

  const stylesMeta = file.styles ?? {};

  const colorsByName = new Map<string, { hex: string; count?: number }>();
  for (const [styleId, meta] of Object.entries(stylesMeta)) {
    if (meta.styleType !== "FILL") continue;
    const hex = fillStyles.get(styleId);
    if (!hex) continue;
    colorsByName.set(shortName(meta.name ?? "Farbe"), {
      hex,
      count: fillUsage.get(hex),
    });
  }

  let source: FigmaStyleguide["source"] = "styles";
  if (colorsByName.size === 0) {
    source = "fills";
    const ranked = Array.from(fillUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, FALLBACK_POOL);
    let i = 1;
    for (const [hex, count] of ranked) {
      if (hex === "#FFFFFF" || hex === "#000000") continue;
      colorsByName.set(`Farbe ${i}`, { hex, count });
      if (++i > FALLBACK_MAX) break;
    }
  }

  const colors: FigmaStyleColor[] = Array.from(
    colorsByName.entries(),
    ([name, { hex, count }]) => ({ name, hex, count })
  );

  const families = new Map<string, Set<string>>();
  for (const [styleId, meta] of Object.entries(stylesMeta)) {
    if (meta.styleType !== "TEXT") continue;
    const t = textStyles.get(styleId);
    if (!t) continue;
    const weights = families.get(t.family) ?? new Set<string>();
    weights.add(weightName(t.weight, t.italic));
    families.set(t.family, weights);
  }
  const fonts: FigmaFontInfo[] = Array.from(
    families.entries(),
    ([family, weights]) => ({ family, weights: Array.from(weights) })
  );

  return { colors, fonts, source };
}

export async function importFigmaStyleguide(
  figmaUrl: string,
  token: string
): Promise<FigmaStyleguide & { fileKey: string }> {
  const fileKey = parseFigmaFileKey(figmaUrl);
  if (!fileKey) {
    throw new FigmaImportError("Kein gueltiger Figma-Link.");
  }
  const file = await fetchFigmaFile(fileKey, token);
  const styleguide = extractStyleguide(file);
  if (styleguide.colors.length === 0 && styleguide.fonts.length === 0) {
    throw new FigmaImportError(
      "In der Datei wurden weder Farb-Styles noch Text-Styles gefunden."
    );
  }
  return { ...styleguide, fileKey };
}
