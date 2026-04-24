import { NextResponse } from "next/server";

import {
  extractColorsFromWebsite,
  serializeColors,
  validatePublicUrl,
} from "@/lib/extractColors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungueltiger Request-Body." },
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

  let normalizedUrl: string;
  try {
    normalizedUrl = validatePublicUrl(rawUrl.trim());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "URL konnte nicht validiert werden.",
      },
      { status: 400 }
    );
  }

  try {
    const map = await extractColorsFromWebsite(normalizedUrl);
    const colors = serializeColors(map);
    return NextResponse.json({ url: normalizedUrl, colors });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Website konnte nicht gelesen werden: ${error.message}`
            : "Website konnte nicht gelesen werden.",
      },
      { status: 502 }
    );
  }
}
