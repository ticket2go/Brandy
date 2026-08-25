// Akzeptiert figma.com/design|file|board|proto-Links und extrahiert den File-Key.
const FIGMA_FILE_KEY_RE =
  /figma\.com\/(?:design|file|board|proto)\/([A-Za-z0-9]{10,128})/;

export function parseFigmaFileKey(input: string): string | null {
  const match = input.trim().match(FIGMA_FILE_KEY_RE);
  return match ? match[1] : null;
}

export function isFigmaFileUrl(input: string): boolean {
  return parseFigmaFileKey(input) !== null;
}
