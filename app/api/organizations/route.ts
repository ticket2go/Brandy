import { NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/getRequestUser";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slugify";

export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  legal_name?: string;
  // Neuer Multi-Manager-Style: Liste von Benutzernamen.
  manager_usernames?: string[] | null;
  // Backwards-Compat: einzelner Verwalter (wird wie ein Array der Länge 1
  // behandelt).
  manager_username?: string | null;
};

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServerSupabaseClient();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server config fehlt." },
      { status: 500 }
    );
  }

  const profile = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile.data?.is_admin) {
    return NextResponse.json(
      { error: "Nur Admins dürfen alle Organisationen sehen." },
      { status: 403 }
    );
  }

  const orgsRes = await supabase
    .from("organizations")
    .select("id, name, legal_name, slug, logo_url, manager_id, created_at")
    .order("created_at", { ascending: true });
  if (orgsRes.error) {
    return NextResponse.json({ error: orgsRes.error.message }, { status: 500 });
  }

  // Pro Org alle Manager (role='manager') mit nachladen.
  const orgIds = (orgsRes.data ?? []).map((o) => o.id);
  let managersByOrg = new Map<
    string,
    Array<{ id: string; username: string | null; full_name: string | null }>
  >();
  if (orgIds.length > 0) {
    const membersRes = await supabase
      .from("organization_members")
      .select(
        "organization_id, role, profile:profiles(id, username, full_name)"
      )
      .in("organization_id", orgIds)
      .eq("role", "manager");
    if (membersRes.error) {
      return NextResponse.json(
        { error: membersRes.error.message },
        { status: 500 }
      );
    }
    type Row = {
      organization_id: string;
      role: string;
      profile: {
        id: string;
        username: string | null;
        full_name: string | null;
      } | null;
    };
    for (const row of (membersRes.data ?? []) as Row[]) {
      if (!row.profile) continue;
      const list = managersByOrg.get(row.organization_id) ?? [];
      list.push(row.profile);
      managersByOrg.set(row.organization_id, list);
    }
  }

  const enriched = (orgsRes.data ?? []).map((o) => ({
    ...o,
    managers: managersByOrg.get(o.id) ?? [],
  }));

  return NextResponse.json({ organizations: enriched });
}

function collectManagerUsernames(body: Body): string[] | null {
  if (Array.isArray(body.manager_usernames)) {
    return body.manager_usernames
      .map((u) => (u ?? "").trim().toLowerCase())
      .filter((u) => u.length > 0);
  }
  if (typeof body.manager_username === "string") {
    const u = body.manager_username.trim().toLowerCase();
    return u ? [u] : [];
  }
  // undefined → keine Änderung gewünscht (für PATCH); für POST behandelt
  // der Caller das Ergebnis null als "keine Manager".
  return null;
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const legalName = (body.legal_name ?? "").trim();
  const managerUsernames = collectManagerUsernames(body) ?? [];

  if (!name) {
    return NextResponse.json(
      { error: "Name darf nicht leer sein." },
      { status: 400 }
    );
  }
  if (!legalName) {
    return NextResponse.json(
      { error: "Firmierung darf nicht leer sein." },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = createServerSupabaseClient();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server config fehlt." },
      { status: 500 }
    );
  }

  const profile = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile.data?.is_admin) {
    return NextResponse.json(
      { error: "Nur Admins dürfen Organisationen anlegen." },
      { status: 403 }
    );
  }

  // Manager-Usernames in Profile-IDs übersetzen, dabei Duplikate filtern.
  const uniqueUsernames = Array.from(new Set(managerUsernames));
  let managerProfileIds: string[] = [];
  if (uniqueUsernames.length > 0) {
    const profilesRes = await supabase
      .from("profiles")
      .select("id, username")
      .in("username", uniqueUsernames);
    if (profilesRes.error) {
      return NextResponse.json(
        { error: profilesRes.error.message },
        { status: 500 }
      );
    }
    const found = (profilesRes.data ?? []) as Array<{
      id: string;
      username: string | null;
    }>;
    const foundUsernames = new Set(
      found.map((p) => (p.username ?? "").toLowerCase())
    );
    const missing = uniqueUsernames.filter((u) => !foundUsernames.has(u));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Verwalter „${missing.join(
            ", "
          )}" wurden nicht gefunden. Lege die User vorher in Registrierung an.`,
        },
        { status: 400 }
      );
    }
    managerProfileIds = found.map((p) => p.id);
  }

  const baseSlug = slugify(name);
  const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

  // Erste Manager als manager_id setzen (Backwards-Compat: vereinzelte
  // Stellen lesen noch organizations.manager_id). Alle weiteren werden über
  // organization_members als role='manager' angelegt.
  const primaryManagerId = managerProfileIds[0] ?? null;

  const insert = await supabase
    .from("organizations")
    .insert({
      name,
      legal_name: legalName,
      slug: uniqueSlug,
      manager_id: primaryManagerId,
    })
    .select(
      "id, name, legal_name, slug, logo_url, manager_id, created_at"
    )
    .single();
  if (insert.error || !insert.data) {
    return NextResponse.json(
      { error: insert.error?.message ?? "Organisation konnte nicht angelegt werden." },
      { status: 500 }
    );
  }

  if (managerProfileIds.length > 0) {
    const rows = managerProfileIds.map((id) => ({
      organization_id: insert.data!.id,
      user_id: id,
      role: "manager" as const,
    }));
    const upsert = await supabase
      .from("organization_members")
      .upsert(rows, { onConflict: "organization_id,user_id" });
    if (upsert.error) {
      return NextResponse.json(
        { error: upsert.error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ organization: insert.data });
}
