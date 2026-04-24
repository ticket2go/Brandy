import { NextResponse } from "next/server";

import { fetchGoogleFontsCatalog, searchFamilies } from "@/lib/googleFonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const limitParam = searchParams.get("limit");
  const limit = Math.max(
    1,
    Math.min(50, limitParam ? parseInt(limitParam, 10) || 20 : 20)
  );

  try {
    const catalog = await fetchGoogleFontsCatalog();
    const results = searchFamilies(catalog, query, limit);
    return NextResponse.json({
      results: results.map((r) => ({
        family: r.family,
        category: r.category,
        variants: r.variants,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google-Fonts-Katalog konnte nicht geladen werden.",
      },
      { status: 502 }
    );
  }
}
