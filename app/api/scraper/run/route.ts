import { NextResponse } from "next/server";

import {
  isEventimUrl,
  scrapeEventim,
  scrapeEventimFollowUpGroup,
  scrapeEventimFollowUps,
} from "@/lib/eventim-scraper";
import type { ScrapedEvent } from "@/lib/scraped-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const rawUrl =
    typeof body === "object" && body !== null && "url" in body
      ? String((body as { url: unknown }).url ?? "").trim()
      : "";

  if (!rawUrl) {
    return NextResponse.json({ error: "Bitte eine URL angeben." }, { status: 400 });
  }

  if (!isEventimUrl(rawUrl)) {
    return NextResponse.json(
      {
        events: [],
        warning: null,
        error: "Aktuell werden nur Eventim-Links unterstützt.",
      },
      { status: 400 }
    );
  }

  const followUps =
    typeof body === "object" && body !== null && "followUps" in body
      ? Boolean((body as { followUps?: unknown }).followUps)
      : false;
  const sourceEvents =
    typeof body === "object" &&
    body !== null &&
    "events" in body &&
    Array.isArray((body as { events?: unknown }).events)
      ? ((body as { events: ScrapedEvent[] }).events)
      : [];
  const groupId =
    typeof body === "object" &&
    body !== null &&
    "groupId" in body &&
    typeof (body as { groupId?: unknown }).groupId === "string"
      ? (body as { groupId: string }).groupId.trim()
      : "";

  try {
    const result =
      followUps && groupId
        ? await scrapeEventimFollowUpGroup(sourceEvents, rawUrl, groupId)
        : followUps
          ? await scrapeEventimFollowUps(sourceEvents, rawUrl)
          : await scrapeEventim(rawUrl);
    return NextResponse.json({ ...result, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        events: [],
        warning: null,
        error:
          error instanceof Error
            ? error.message
            : "Die Seite konnte nicht gescraped werden.",
      },
      { status: 502 }
    );
  }
}
