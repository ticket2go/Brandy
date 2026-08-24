import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  if (!isAllowedMediaUrl(raw)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const head = await fetch(raw, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { accept: "image/*,*/*;q=0.8" },
    });
    if (head.ok) return NextResponse.json({ ok: true });
    if (head.status !== 405 && head.status !== 501) {
      return NextResponse.json({ ok: false });
    }
  } catch {
    // Manche CDNs blockieren HEAD – GET als Fallback.
  }
  try {
    const get = await fetch(raw, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { accept: "image/*,*/*;q=0.8" },
    });
    try {
      await get.body?.cancel();
    } catch {
      // Stream-Abbruch ist optional.
    }
    return NextResponse.json({ ok: get.ok });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

function isAllowedMediaUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      /(^|\.)eventim\.(de|at|ch|com)$/i.test(url.hostname) &&
      /\.(jpe?g|png|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
