import { NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/getRequestUser";
import { resolveFigmaToken } from "@/lib/figma-server-token";
import {
  FigmaImportError,
  importFigmaStyleguide,
} from "@/lib/figmaStyleguide";
import { parseFigmaFileKey } from "@/lib/figmaUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungueltiger Request-Body." },
      { status: 400 }
    );
  }

  const url =
    typeof (body as { url?: unknown })?.url === "string"
      ? ((body as { url: string }).url ?? "").trim()
      : "";
  if (!url) {
    return NextResponse.json(
      { error: "Bitte einen Figma-Link angeben." },
      { status: 400 }
    );
  }
  if (!parseFigmaFileKey(url)) {
    return NextResponse.json(
      {
        error:
          "Kein gueltiger Figma-Link (figma.com/design/… oder figma.com/file/…).",
      },
      { status: 400 }
    );
  }

  const token = await resolveFigmaToken();
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Kein Figma-Token hinterlegt. Speichere zuerst einen Personal Access Token.",
        tokenMissing: true,
      },
      { status: 400 }
    );
  }

  try {
    const { fileKey, colors, fonts, source } = await importFigmaStyleguide(
      url,
      token
    );
    return NextResponse.json({ fileKey, colors, fonts, source });
  } catch (error) {
    if (error instanceof FigmaImportError) {
      const status =
        error.status === 403 || error.status === 404 ? 422 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      {
        error: `Figma-Import fehlgeschlagen: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 502 }
    );
  }
}
