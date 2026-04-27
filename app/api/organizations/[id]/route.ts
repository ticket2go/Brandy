import { NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/getRequestUser";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  legal_name?: string;
  manager_usernames?: string[] | null;
  manager_username?: string | null;
  logo_url?: string | null;
};

async function loadAuthContext(userId: string, orgId: string) {
  const supabase = createServerSupabaseClient();
  const [profileRes, orgRes, memberRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, is_admin")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("id, manager_id")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("id, role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const isAdmin = !!profileRes.data?.is_admin;
  const isPrimaryManager =
    !!orgRes.data && orgRes.data.manager_id === userId;
  const isMemberManager = memberRes.data?.role === "manager";
  return {
    supabase,
    org: orgRes.data,
    isAdmin,
    isManager: isPrimaryManager || isMemberManager,
  };
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
  if (body.manager_username === null) return [];
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  let ctx;
  try {
    ctx = await loadAuthContext(user.id, params.id);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Server config fehlt.",
      },
      { status: 500 }
    );
  }

  if (!ctx.org) {
    return NextResponse.json(
      { error: "Organisation nicht gefunden." },
      { status: 404 }
    );
  }

  if (!ctx.isAdmin && !ctx.isManager) {
    return NextResponse.json(
      { error: "Keine Berechtigung." },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const update: {
    name?: string;
    legal_name?: string;
    logo_url?: string | null;
    manager_id?: string | null;
  } = {};
  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (!v) {
      return NextResponse.json({ error: "Name darf nicht leer sein." }, { status: 400 });
    }
    update.name = v;
  }
  if (typeof body.legal_name === "string") {
    const v = body.legal_name.trim();
    if (!v) {
      return NextResponse.json(
        { error: "Firmierung darf nicht leer sein." },
        { status: 400 }
      );
    }
    update.legal_name = v;
  }
  if (typeof body.logo_url !== "undefined") {
    update.logo_url = body.logo_url;
  }

  // Manager-Änderungen: nur Admins dürfen die Verwalter-Liste anpassen.
  // Verwalter selbst können ihre eigene Liste also nicht erweitern – das
  // bleibt eine Admin-Aufgabe. (Ist trotzdem sicher, weil DB-Policies das
  // ohnehin via is_admin_user prüfen würden.)
  const managerUsernames =
    typeof body.manager_usernames !== "undefined" ||
    typeof body.manager_username !== "undefined"
      ? collectManagerUsernames(body)
      : null;

  if (managerUsernames !== null) {
    if (!ctx.isAdmin) {
      return NextResponse.json(
        { error: "Nur Admins dürfen die Verwalter ändern." },
        { status: 403 }
      );
    }
  }

  let resolvedManagerIds: string[] | null = null;
  if (managerUsernames !== null) {
    const unique = Array.from(new Set(managerUsernames));
    if (unique.length === 0) {
      resolvedManagerIds = [];
    } else {
      const profilesRes = await ctx.supabase
        .from("profiles")
        .select("id, username")
        .in("username", unique);
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
      const missing = unique.filter((u) => !foundUsernames.has(u));
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Verwalter „${missing.join(", ")}" wurden nicht gefunden.`,
          },
          { status: 400 }
        );
      }
      resolvedManagerIds = found.map((p) => p.id);
    }
    update.manager_id = resolvedManagerIds[0] ?? null;
  }

  if (Object.keys(update).length > 0) {
    const upd = await ctx.supabase
      .from("organizations")
      .update(update)
      .eq("id", params.id)
      .select("id, name, legal_name, slug, logo_url, manager_id")
      .single();
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
  }

  // Manager-Mitgliedschaften synchronisieren.
  if (resolvedManagerIds !== null) {
    const desired = new Set(resolvedManagerIds);

    // Bestehende Manager-Members holen.
    const existingRes = await ctx.supabase
      .from("organization_members")
      .select("id, user_id, role")
      .eq("organization_id", params.id)
      .eq("role", "manager");
    if (existingRes.error) {
      return NextResponse.json(
        { error: existingRes.error.message },
        { status: 500 }
      );
    }
    const existing = (existingRes.data ?? []) as Array<{
      id: string;
      user_id: string;
      role: string;
    }>;
    const existingIds = new Set(existing.map((e) => e.user_id));

    // Add: alle in desired, die noch nicht role=manager sind → upsert.
    const toAdd = Array.from(desired).filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      const rows = toAdd.map((id) => ({
        organization_id: params.id,
        user_id: id,
        role: "manager" as const,
      }));
      const upsert = await ctx.supabase
        .from("organization_members")
        .upsert(rows, { onConflict: "organization_id,user_id" });
      if (upsert.error) {
        return NextResponse.json(
          { error: upsert.error.message },
          { status: 500 }
        );
      }
    }

    // Remove (Downgrade): existierende Manager-Members, die nicht mehr in
    // desired sind, downgraden wir auf 'mitglied' statt sie ganz zu löschen.
    const toDowngrade = existing.filter((e) => !desired.has(e.user_id));
    if (toDowngrade.length > 0) {
      const downgrade = await ctx.supabase
        .from("organization_members")
        .update({ role: "mitglied" })
        .in(
          "id",
          toDowngrade.map((m) => m.id)
        );
      if (downgrade.error) {
        return NextResponse.json(
          { error: downgrade.error.message },
          { status: 500 }
        );
      }
    }
  }

  // Aktuelle Org + Manager zurückgeben.
  const finalOrg = await ctx.supabase
    .from("organizations")
    .select("id, name, legal_name, slug, logo_url, manager_id")
    .eq("id", params.id)
    .single();
  if (finalOrg.error) {
    return NextResponse.json({ error: finalOrg.error.message }, { status: 500 });
  }
  const managers = await ctx.supabase
    .from("organization_members")
    .select("profile:profiles(id, username, full_name)")
    .eq("organization_id", params.id)
    .eq("role", "manager");
  type MgrRow = {
    profile: {
      id: string;
      username: string | null;
      full_name: string | null;
    } | null;
  };
  const managerProfiles = ((managers.data ?? []) as MgrRow[])
    .map((r) => r.profile)
    .filter((p): p is NonNullable<MgrRow["profile"]> => !!p);

  return NextResponse.json({
    organization: { ...finalOrg.data, managers: managerProfiles },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  let supabase;
  let isAdmin = false;
  try {
    supabase = createServerSupabaseClient();
    const profile = await supabase
      .from("profiles")
      .select("id, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = !!profile.data?.is_admin;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server config fehlt." },
      { status: 500 }
    );
  }

  if (!isAdmin) {
    return NextResponse.json(
      { error: "Nur Admins dürfen Organisationen löschen." },
      { status: 403 }
    );
  }

  const del = await supabase
    .from("organizations")
    .delete()
    .eq("id", params.id);
  if (del.error) {
    return NextResponse.json({ error: del.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
