import { NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/getRequestUser";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  legal_name?: string;
  manager_username?: string | null;
  logo_url?: string | null;
};

async function requireAdmin(userId: string) {
  const supabase = createServerSupabaseClient();
  const profile = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", userId)
    .maybeSingle();
  return { supabase, isAdmin: !!profile.data?.is_admin };
}

export async function PATCH(
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
    const ctx = await requireAdmin(user.id);
    supabase = ctx.supabase;
    isAdmin = ctx.isAdmin;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server config fehlt." },
      { status: 500 }
    );
  }

  const orgRes = await supabase
    .from("organizations")
    .select("id, manager_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!orgRes.data) {
    return NextResponse.json(
      { error: "Organisation nicht gefunden." },
      { status: 404 }
    );
  }

  if (!isAdmin && orgRes.data.manager_id !== user.id) {
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
  if (typeof body.manager_username !== "undefined") {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Nur Admins dürfen den Verwalter ändern." },
        { status: 403 }
      );
    }
    if (body.manager_username === null || body.manager_username === "") {
      update.manager_id = null;
    } else {
      const managerUsername = body.manager_username.trim().toLowerCase();
      const managerRes = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", managerUsername)
        .maybeSingle();
      if (!managerRes.data) {
        return NextResponse.json(
          { error: `Verwalter „${managerUsername}“ wurde nicht gefunden.` },
          { status: 400 }
        );
      }
      update.manager_id = managerRes.data.id;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const upd = await supabase
    .from("organizations")
    .update(update)
    .eq("id", params.id)
    .select("id, name, legal_name, slug, logo_url, manager_id")
    .single();
  if (upd.error) {
    return NextResponse.json({ error: upd.error.message }, { status: 500 });
  }

  return NextResponse.json({ organization: upd.data });
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
    const ctx = await requireAdmin(user.id);
    supabase = ctx.supabase;
    isAdmin = ctx.isAdmin;
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
