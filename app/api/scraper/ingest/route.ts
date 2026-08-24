import { NextResponse } from "next/server";

import { prepareGethypedImages } from "@/lib/gethyped-images";
import { emptyIngest, finalizeIngest, type ScraperIngest } from "@/lib/gethyped-ingest";
import {
  chunkEvents,
  mapScrapedEvents,
  type GethypedEvent,
} from "@/lib/gethyped-map";
import { envIngestToken, storedIngestToken } from "@/lib/gethyped-server-token";
import { verifyBatchImages } from "@/lib/gethyped-verify";
import {
  ingestProgressLabel,
  makeIngestProgress,
  type IngestProgress,
} from "@/lib/ingest-progress";
import type { ScrapedEvent } from "@/lib/scraped-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

const DEFAULT_BASE = "https://staging.gethyped.events/api/v1/ingest";
const MAX_EVENTS = 500;
const MAX_BYTES = 1_800_000;

export async function GET() {
  const configured = Boolean(envIngestToken() || (await storedIngestToken()));
  return NextResponse.json({ configured });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const token = await readToken(body);
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Kein GetHyped-Token. Unter Import › Event Sources einen Crawler-Token ausstellen und hier eintragen oder GETHYPED_INGEST_TOKEN setzen.",
      },
      { status: 503 }
    );
  }

  const events = readEvents(body);
  if (events.length === 0) {
    return NextResponse.json({ error: "Keine Events zum Senden." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      const progress = (next: IngestProgress) => {
        send({
          type: "progress",
          ...next,
          label: next.label || ingestProgressLabel(next),
        });
      };

      const result = emptyIngest();
      try {
        progress(makeIngestProgress("map"));
        const mapped = mapScrapedEvents(events);
        result.skipped = mapped.skipped.length;
        result.skippedItems = mapped.skipped.slice(0, 40);

        progress(makeIngestProgress("images", 0, mapped.accepted.length));
        const prepared = await prepareGethypedImages(
          mapped.accepted,
          (done, total) => progress(makeIngestProgress("images", done, total))
        );
        result.sent = prepared.events.length;
        result.withImage = prepared.withImage;
        result.withoutImage = prepared.events.length - prepared.withImage;
        result.imagelessItems = prepared.events
          .filter((event) => !event.image_url)
          .slice(0, 20)
          .map((event) => ({
            name: event.name,
            reason: "Auf Eventim war kein Bild auffindbar.",
          }));

        if (prepared.events.length === 0) {
          result.error = "Kein Event erfüllt die GetHyped-Regeln.";
          send({ type: "result", ingest: finalizeIngest(result) });
          controller.close();
          return;
        }

        const base = ingestBase();
        const runId = newId();
        const chunks = chunkEvents(prepared.events, MAX_EVENTS, MAX_BYTES);
        progress(makeIngestProgress("send", 0, chunks.length));

        for (const [index, chunk] of chunks.entries()) {
          const sent = await postChunk(base, token, chunk, `${runId}-${index + 1}`);
          if (sent.batchId) result.batches.push(sent.batchId);
          result.accepted += sent.accepted;
          result.rejected += sent.rejected;
          result.rejectedItems.push(...sent.rejectedItems);
          if (sent.replayed) {
            result.error =
              result.error ?? "Dieselbe Lieferung wurde erneut bestätigt.";
          }
          progress(makeIngestProgress("send", index + 1, chunks.length));
        }

        if (result.accepted === 0 && result.rejected > 0) {
          result.error = result.error ?? "GetHyped hat alle Events abgelehnt.";
        }

        progress(makeIngestProgress("verify", 0, Math.max(1, result.batches.length)));
        const check = await verifyBatchImages(
          base,
          token,
          result.batches,
          (done, total) => progress(makeIngestProgress("verify", done, total))
        );
        if (check.checked) {
          result.imagesConfirmed = check.confirmed;
          result.imagesMissing = check.missing;
        } else if (result.withImage > 0 && result.accepted > 0) {
          result.imagesConfirmed = null;
          result.imagesMissing = 0;
        }

        progress(makeIngestProgress("done", 1, 1));
        send({ type: "result", ingest: finalizeIngest(result) });
      } catch (error) {
        result.error =
          error instanceof Error
            ? error.message
            : "Senden an GetHyped ist fehlgeschlagen.";
        send({ type: "result", ingest: finalizeIngest(result) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readToken(body: unknown): Promise<string> {
  if (typeof body === "object" && body !== null && "token" in body) {
    const value = (body as { token?: unknown }).token;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return envIngestToken() || (await storedIngestToken());
}

function readEvents(body: unknown): ScrapedEvent[] {
  if (typeof body !== "object" || body === null || !("events" in body)) return [];
  const raw = (body as { events?: unknown }).events;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ScrapedEvent =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as ScrapedEvent).name === "string"
  );
}

function ingestBase(): string {
  const raw =
    process.env.GETHYPED_INGEST_URL?.trim() ||
    process.env.GETHYPED_INGEST_BASE?.trim() ||
    DEFAULT_BASE;
  return raw.replace(/\/+$/, "");
}

async function postChunk(
  base: string,
  token: string,
  events: GethypedEvent[],
  idempotencyKey: string
): Promise<{
  batchId: string | null;
  accepted: number;
  rejected: number;
  rejectedItems: Array<{ name: string; reason: string }>;
  replayed: boolean;
}> {
  const response = await fetchWithRetry(`${base}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ events }),
  });

  const payload = await readJson(response);
  if (response.status === 401 || response.status === 403) {
    throw new Error(apiMessage(payload) || "GetHyped-Token ist ungültig.");
  }
  if (response.status === 422) {
    const rejectedItems = rejectedFrom(payload, events);
    return {
      batchId: null,
      accepted: 0,
      rejected: events.length,
      rejectedItems,
      replayed: false,
    };
  }
  if (!response.ok) {
    throw new Error(
      apiMessage(payload) || `GetHyped antwortete mit ${response.status}.`
    );
  }

  const rejectedItems = rejectedFrom(payload, events);
  const accepted =
    asNumber(payload, ["accepted", "accepted_count", "accepted_items"]) ??
    Math.max(0, events.length - rejectedItems.length);
  const batchId =
    asString(payload, ["batch_id", "batchId", "id"]) ||
    null;

  return {
    batchId,
    accepted,
    rejected: rejectedItems.length,
    rejectedItems,
    replayed: payload?.idempotent_replay === true,
  };
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 429) return first;
  const wait = Number(first.headers.get("retry-after") || "2");
  await sleep(Math.min(Math.max(wait, 1), 30) * 1000);
  return fetch(url, init);
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload = (await response.json()) as unknown;
    return payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function rejectedFrom(
  payload: Record<string, unknown> | null,
  events: GethypedEvent[]
): Array<{ name: string; reason: string }> {
  const raw =
    payload && Array.isArray(payload.rejected_items)
      ? payload.rejected_items
      : payload && Array.isArray(payload.rejectedItems)
        ? payload.rejectedItems
        : [];
  return raw.slice(0, 40).map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const eventIndex = typeof row.index === "number" ? row.index : index;
    const fallback = events[eventIndex]?.name ?? events[index]?.name ?? "Event";
    const name =
      (typeof row.name === "string" && row.name) ||
      (typeof row.external_id === "string"
        ? events.find((event) => event.external_id === row.external_id)?.name
        : null) ||
      fallback;
    return { name, reason: reasonOf(row) };
  });
}

function reasonOf(row: Record<string, unknown>): string {
  if (typeof row.reason === "string" && row.reason) return row.reason;
  if (typeof row.message === "string" && row.message) return row.message;
  if (Array.isArray(row.errors)) {
    const parts = row.errors
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "message" in item) {
          return String((item as { message: unknown }).message);
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return "Von GetHyped abgelehnt.";
}

function apiMessage(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  if (typeof payload.message === "string" && payload.message) return payload.message;
  if (typeof payload.error === "string" && payload.error) return payload.error;
  if (
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof (payload.error as { message: unknown }).message === "string"
  ) {
    return (payload.error as { message: string }).message;
  }
  return null;
}

function asNumber(
  payload: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function asString(
  payload: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
