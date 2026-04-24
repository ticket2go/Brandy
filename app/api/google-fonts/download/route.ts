import { NextResponse } from "next/server";

import {
  fetchGoogleFontFiles,
  fetchGoogleFontsCatalog,
  findFamily,
  type GoogleFontVariant,
} from "@/lib/googleFonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { family?: unknown; variants?: unknown };
  try {
    body = (await request.json()) as { family?: unknown; variants?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Ungueltiger Request-Body." },
      { status: 400 }
    );
  }

  const familyName =
    typeof body.family === "string" ? body.family.trim() : "";
  if (!familyName) {
    return NextResponse.json(
      { error: "Bitte eine Schriftfamilie angeben." },
      { status: 400 }
    );
  }

  const requestedVariants = Array.isArray(body.variants)
    ? body.variants
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v): v is string => v.length > 0)
    : [];

  if (requestedVariants.length === 0) {
    return NextResponse.json(
      { error: "Bitte mindestens einen Schriftschnitt auswaehlen." },
      { status: 400 }
    );
  }

  try {
    const catalog = await fetchGoogleFontsCatalog();
    const family = findFamily(catalog, familyName);
    if (!family) {
      return NextResponse.json(
        {
          error: `Schriftfamilie "${familyName}" wurde bei Google Fonts nicht gefunden.`,
        },
        { status: 404 }
      );
    }

    const variants: GoogleFontVariant[] = family.variants.filter((v) =>
      requestedVariants.includes(v.variant)
    );
    if (variants.length === 0) {
      return NextResponse.json(
        {
          error:
            "Keiner der angeforderten Schriftschnitte ist fuer diese Familie verfuegbar.",
        },
        { status: 400 }
      );
    }

    const files = await fetchGoogleFontFiles(family.family, variants);
    return NextResponse.json({
      family: family.family,
      category: family.category,
      files,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Schriftdateien konnten nicht geladen werden.",
      },
      { status: 502 }
    );
  }
}
