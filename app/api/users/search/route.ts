import { NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/getRequestUser";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/users/search?q=<prefix>&limit=<n>
//
// Liefert eine Liste {id, username, full_name} für eingeloggte User.
// Wird vom Verwalter-Auswahl-Input für die dynamische Suche genutzt.
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const url = new URL(request.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "8", 10) || 8, 1),
    20
  );

  let supabase;
  try {
    supabase = createServerSupabaseClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Server config fehlt.",
      },
      { status: 500 }
    );
  }

  // Nur Admins ODER Verwalter (= jemand mit manager-Rolle in irgendeiner
  // Org bzw. manager_id in organizations) dürfen User suchen. Sonst leakt
  // unsere Suche die User-Liste an alle Mitglieder.
  const profile = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = !!profile.data?.is_admin;

  if (!isAdmin) {
    const [memberRes, ownedRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "manager")
        .limit(1),
      supabase
        .from("organizations")
        .select("id")
        .eq("manager_id", user.id)
        .limit(1),
    ]);
    const isAnyManager =
      (memberRes.data?.length ?? 0) > 0 || (ownedRes.data?.length ?? 0) > 0;
    if (!isAnyManager) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }
  }

  const q = qRaw.toLowerCase();
  let query = supabase
    .from("profiles")
    .select("id, username, full_name")
    .order("username", { ascending: true })
    .limit(limit);

  if (q.length > 0) {
    // ILIKE-Pattern – username/full_name, escape % und _
    const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
    const pattern = `%${escaped}%`;
    query = query.or(`username.ilike.${pattern},full_name.ilike.${pattern}`);
  }

  const res = await query;
  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  return NextResponse.json({ users: res.data ?? [] });
}
