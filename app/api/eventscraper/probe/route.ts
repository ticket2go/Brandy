import { NextResponse } from "next/server";

import { probeScraperUrl } from "@/lib/event-scraper-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Request-Body." },
      { status: 400 }
    );
  }

  const rawUrl =
    typeof body === "object" && body !== null && "url" in body
      ? String((body as { url: unknown }).url ?? "")
      : "";

  if (!rawUrl.trim()) {
    return NextResponse.json(
      { error: "Bitte eine URL angeben." },
      { status: 400 }
    );
  }

  try {
    const result = await probeScraperUrl(rawUrl.trim());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `URL konnte nicht gelesen werden: ${error.message}`
            : "URL konnte nicht gelesen werden.",
        fields: [],
        events: [],
        warning: null,
      },
      { status: 502 }
    );
  }
}
