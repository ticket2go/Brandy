import { NextResponse } from "next/server";

import { compress as ttfToWoff2 } from "wawoff2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: "Leerer Request-Body." },
        { status: 400 }
      );
    }

    // wawoff2 erwartet ein Buffer/Uint8Array mit einer TTF/OTF-Datei.
    // (WOFF wird NICHT unterstuetzt – zuerst dekomprimieren, falls noetig.)
    const input = Buffer.from(arrayBuffer);
    const woff2 = await ttfToWoff2(input);

    return new NextResponse(new Uint8Array(woff2), {
      status: 200,
      headers: {
        "content-type": "font/woff2",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Konvertierung fehlgeschlagen: ${error.message}`
            : "Konvertierung fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}
