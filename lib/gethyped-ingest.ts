import type { ScrapedEvent } from "@/lib/scraped-event";
import {
  ingestOutcomeOf,
  ingestSummaryOf,
  type IngestOutcome,
  type IngestProgress,
} from "@/lib/ingest-progress";

export type ScraperIngest = {
  at: string;
  sent: number;
  accepted: number;
  rejected: number;
  skipped: number;
  withImage: number;
  imagesConfirmed: number | null;
  imagesMissing: number;
  outcome: IngestOutcome;
  summary: string;
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

export function emptyIngest(error?: string | null): ScraperIngest {
  return finalizeIngest({
    at: new Date().toISOString(),
    sent: 0,
    accepted: 0,
    rejected: 0,
    skipped: 0,
    withImage: 0,
    imagesConfirmed: null,
    imagesMissing: 0,
    batches: [],
    error: error ?? null,
    rejectedItems: [],
    skippedItems: [],
  });
}

export function finalizeIngest(
  row: Omit<ScraperIngest, "outcome" | "summary"> &
    Partial<Pick<ScraperIngest, "outcome" | "summary">>
): ScraperIngest {
  const outcome = ingestOutcomeOf(row);
  return {
    ...row,
    imagesConfirmed: row.imagesConfirmed ?? null,
    imagesMissing: row.imagesMissing ?? 0,
    outcome,
    summary: ingestSummaryOf({ ...row, outcome }),
  };
}

export async function ingestToGethyped(
  events: ScrapedEvent[],
  token?: string,
  onProgress?: (progress: IngestProgress) => void
): Promise<ScraperIngest> {
  const response = await fetch("/api/scraper/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events,
      token: token?.trim() || undefined,
    }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("ndjson") && response.body) {
    return readIngestStream(response.body, onProgress);
  }

  const payload = (await response.json()) as Partial<ScraperIngest> & {
    error?: string | null;
  };
  if (!response.ok && !payload.accepted && payload.accepted !== 0) {
    throw new Error(payload.error || "Senden an GetHyped ist fehlgeschlagen.");
  }
  return (
    normalizeIngest({
      ...payload,
      error: payload.error ?? (response.ok ? null : "Senden an GetHyped ist fehlgeschlagen."),
    }) ??
    emptyIngest(payload.error ?? "Senden an GetHyped ist fehlgeschlagen.")
  );
}

async function readIngestStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: (progress: IngestProgress) => void
): Promise<ScraperIngest> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ScraperIngest | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      const parsed = parseStreamLine(line);
      if (!parsed) continue;
      if (parsed.type === "progress") {
        onProgress?.({
          phase: parsed.phase,
          label: parsed.label,
          percent: parsed.percent,
          done: parsed.done,
          total: parsed.total,
        });
      }
      if (parsed.type === "result" && parsed.ingest) {
        result = parsed.ingest;
      }
    }
    if (done) break;
  }

  if (result) return result;
  throw new Error("GetHyped hat keine Abschlussmeldung geliefert.");
}

function parseStreamLine(line: string):
  | { type: "progress" } & IngestProgress
  | { type: "result"; ingest: ScraperIngest }
  | null {
  const raw = line.trim();
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (payload.type === "progress") {
      return {
        type: "progress",
        phase:
          payload.phase === "images" ||
          payload.phase === "send" ||
          payload.phase === "verify" ||
          payload.phase === "done"
            ? payload.phase
            : "map",
        label: typeof payload.label === "string" ? payload.label : "Übertragen …",
        percent:
          typeof payload.percent === "number" ? payload.percent : 0,
        done: typeof payload.done === "number" ? payload.done : 0,
        total: typeof payload.total === "number" ? payload.total : 0,
      };
    }
    if (payload.type === "result") {
      const ingest = normalizeIngest(payload.ingest);
      return ingest ? { type: "result", ingest } : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeIngest(value: unknown): ScraperIngest | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ScraperIngest>;
  if (typeof row.at !== "string") return null;
  const num = (item: unknown) =>
    typeof item === "number" && Number.isFinite(item) ? item : 0;
  const imagesConfirmed =
    row.imagesConfirmed == null ? null : num(row.imagesConfirmed);
  return finalizeIngest({
    at: row.at,
    sent: num(row.sent),
    accepted: num(row.accepted),
    rejected: num(row.rejected),
    skipped: num(row.skipped),
    withImage: num(row.withImage),
    imagesConfirmed,
    imagesMissing: num(row.imagesMissing),
    batches: Array.isArray(row.batches)
      ? row.batches.filter((item): item is string => typeof item === "string")
      : [],
    error: typeof row.error === "string" ? row.error : null,
    rejectedItems: asNamedReasons(row.rejectedItems),
    skippedItems: asNamedReasons(row.skippedItems),
  });
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
