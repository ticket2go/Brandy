import type { ScrapedEvent } from "@/lib/scraped-event";

export type ScraperIngest = {
  at: string;
  sent: number;
  accepted: number;
  rejected: number;
  skipped: number;
  batches: string[];
  error: string | null;
  rejectedItems: Array<{ name: string; reason: string }>;
  skippedItems: Array<{ name: string; reason: string }>;
};

const TOKEN_KEY = "eventscraper.gethyped.token";

export function loadGethypedToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveGethypedToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (token.trim()) window.localStorage.setItem(TOKEN_KEY, token.trim());
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Token bleibt nur im Formular.
  }
}

export async function gethypedConfigured(): Promise<boolean> {
  try {
    const response = await fetch("/api/scraper/ingest", { method: "GET" });
    const payload = (await response.json()) as { configured?: boolean };
    return payload.configured === true;
  } catch {
    return false;
  }
}

export async function ingestToGethyped(
  events: ScrapedEvent[],
  token?: string
): Promise<ScraperIngest> {
  const response = await fetch("/api/scraper/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events,
      token: token?.trim() || undefined,
    }),
  });
  const payload = (await response.json()) as Partial<ScraperIngest> & {
    error?: string | null;
  };
  if (!response.ok && !payload.accepted && payload.accepted !== 0) {
    throw new Error(payload.error || "Senden an GetHyped ist fehlgeschlagen.");
  }
  return normalizeIngest({
    ...payload,
    error: payload.error ?? (response.ok ? null : "Senden an GetHyped ist fehlgeschlagen."),
  }) ?? {
    at: new Date().toISOString(),
    sent: 0,
    accepted: 0,
    rejected: 0,
    skipped: 0,
    batches: [],
    error: payload.error ?? "Senden an GetHyped ist fehlgeschlagen.",
    rejectedItems: [],
    skippedItems: [],
  };
}

export function normalizeIngest(value: unknown): ScraperIngest | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ScraperIngest>;
  if (typeof row.at !== "string") return null;
  const num = (item: unknown) =>
    typeof item === "number" && Number.isFinite(item) ? item : 0;
  return {
    at: row.at,
    sent: num(row.sent),
    accepted: num(row.accepted),
    rejected: num(row.rejected),
    skipped: num(row.skipped),
    batches: Array.isArray(row.batches)
      ? row.batches.filter((item): item is string => typeof item === "string")
      : [],
    error: typeof row.error === "string" ? row.error : null,
    rejectedItems: asNamedReasons(row.rejectedItems),
    skippedItems: asNamedReasons(row.skippedItems),
  };
}

function asNamedReasons(
  value: unknown
): Array<{ name: string; reason: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { name?: unknown; reason?: unknown };
      if (typeof row.reason !== "string") return null;
      return {
        name: typeof row.name === "string" && row.name ? row.name : "Event",
        reason: row.reason,
      };
    })
    .filter((item): item is { name: string; reason: string } => item !== null);
}
