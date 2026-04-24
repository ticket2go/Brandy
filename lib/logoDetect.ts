export type LogoFormat = "eps" | "jpg" | "png" | "svg" | "pdf";
export type LogoVariant = "bildmarke" | "wortmarke" | "wort-bildmarke";
export type LogoPolarity = "positiv" | "negativ";
export type LogoColorSpace = "cmyk" | "rgb";

export const LOGO_FORMATS: LogoFormat[] = ["eps", "jpg", "png", "svg", "pdf"];

export const LOGO_FORMAT_LABELS: Record<LogoFormat, string> = {
  eps: "EPS",
  jpg: "JPG",
  png: "PNG",
  svg: "SVG",
  pdf: "PDF",
};

export const LOGO_VARIANT_LABELS: Record<LogoVariant, string> = {
  bildmarke: "Bildmarke",
  wortmarke: "Wortmarke",
  "wort-bildmarke": "Wort-Bildmarke",
};

export const LOGO_POLARITY_LABELS: Record<LogoPolarity, string> = {
  positiv: "Positiv",
  negativ: "Negativ",
};

export const LOGO_COLOR_SPACE_LABELS: Record<LogoColorSpace, string> = {
  cmyk: "CMYK",
  rgb: "RGB",
};

export function logoFormatFromFilename(name: string): LogoFormat | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (ext === "jpeg") return "jpg";
  if ((LOGO_FORMATS as string[]).includes(ext)) return ext as LogoFormat;
  return null;
}

export function mimeTypeForLogoFormat(format: LogoFormat): string {
  switch (format) {
    case "eps":
      return "application/postscript";
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
  }
}

const VARIANT_PATTERNS: Array<{ variant: LogoVariant; patterns: RegExp[] }> = [
  {
    variant: "wort-bildmarke",
    patterns: [
      /wort[-_\s]*bild[-_\s]*marke/i,
      /wort[-_\s]*bildmarke/i,
      /wort\+bild/i,
      /wb[-_\s]*marke/i,
    ],
  },
  {
    variant: "bildmarke",
    patterns: [
      /bild[-_\s]*marke/i,
      /bildmark/i,
      /\bicon\b/i,
      /\bsymbol\b/i,
      /\bsignet\b/i,
    ],
  },
  {
    variant: "wortmarke",
    patterns: [
      /wort[-_\s]*marke/i,
      /wortmark/i,
      /\bwordmark\b/i,
      /\blogotype\b/i,
      /\btext[-_\s]*logo\b/i,
    ],
  },
];

const POLARITY_PATTERNS: Array<{ polarity: LogoPolarity; patterns: RegExp[] }> = [
  {
    polarity: "negativ",
    patterns: [
      /\bnegativ\b/i,
      /\bnegative\b/i,
      /\bneg\b/i,
      /\binvert(?:ed|iert)?\b/i,
      /\bwhite\b/i,
      /\bdark(?:[-_\s]*bg)?\b/i,
      /\bon[-_\s]*black\b/i,
      /\bon[-_\s]*dark\b/i,
      /\bweiss\b/i,
      /\bweiß\b/i,
    ],
  },
  {
    polarity: "positiv",
    patterns: [
      /\bpositiv\b/i,
      /\bpositive\b/i,
      /\bpos\b/i,
      /\bblack\b/i,
      /\blight(?:[-_\s]*bg)?\b/i,
      /\bon[-_\s]*white\b/i,
      /\bon[-_\s]*light\b/i,
      /\bschwarz\b/i,
    ],
  },
];

const COLOR_SPACE_PATTERNS: Array<{
  colorSpace: LogoColorSpace;
  patterns: RegExp[];
}> = [
  {
    colorSpace: "cmyk",
    patterns: [/\bcmyk\b/i, /\b4c\b/i, /\bvier[-_\s]*farb\b/i, /\bprint\b/i],
  },
  {
    colorSpace: "rgb",
    patterns: [/\brgb\b/i, /\bscreen\b/i, /\bdigital\b/i, /\bweb\b/i],
  },
];

export type LogoGuess = {
  variant: LogoVariant | null;
  polarity: LogoPolarity | null;
  colorSpace: LogoColorSpace | null;
};

export function guessLogoMeta(fileName: string): LogoGuess {
  const base = fileName.replace(/\.[^.]+$/, "");

  let variant: LogoVariant | null = null;
  for (const entry of VARIANT_PATTERNS) {
    if (entry.patterns.some((p) => p.test(base))) {
      variant = entry.variant;
      break;
    }
  }

  let polarity: LogoPolarity | null = null;
  for (const entry of POLARITY_PATTERNS) {
    if (entry.patterns.some((p) => p.test(base))) {
      polarity = entry.polarity;
      break;
    }
  }

  let colorSpace: LogoColorSpace | null = null;
  for (const entry of COLOR_SPACE_PATTERNS) {
    if (entry.patterns.some((p) => p.test(base))) {
      colorSpace = entry.colorSpace;
      break;
    }
  }

  // EPS/PDF werden typischerweise fuer den Druck verwendet (CMYK),
  // wenn die Datei anderweitig keinen Hinweis liefert. JPG/PNG/SVG
  // bleiben ohne expliziten Hinweis unzugeordnet.
  // (Diese Heuristik wird bewusst NICHT hier angewendet, damit der
  // Nutzer explizit nachfragt bekommt; die Extension allein ist kein
  // ausreichender Beleg.)

  return { variant, polarity, colorSpace };
}

export function isLogoFullyClassified(guess: LogoGuess): boolean {
  return (
    guess.variant !== null &&
    guess.polarity !== null &&
    guess.colorSpace !== null
  );
}
