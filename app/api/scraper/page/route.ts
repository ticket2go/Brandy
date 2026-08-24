import { NextResponse } from "next/server";

import {
  fetchEventimHtml,
  isEventimProductPage,
  withoutListingThumb,
} from "@/lib/eventim-artwork";
import { pageHeroImage } from "@/lib/eventim-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  if (!isEventimProductPage(raw)) {
    return NextResponse.json({ hero: null }, { status: 400 });
  }
  const html = await fetchEventimHtml(raw);
  if (!html) return NextResponse.json({ hero: null });
  return NextResponse.json({
    hero: withoutListingThumb(pageHeroImage(html, raw)),
  });
}
