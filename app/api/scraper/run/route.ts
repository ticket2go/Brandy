import { NextResponse } from "next/server";

import { isEventimUrl, scrapeEventim } from "@/lib/eventim-scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

  try {
    const result = await scrapeEventim(rawUrl);
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
