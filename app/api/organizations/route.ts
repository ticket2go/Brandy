import { NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/getRequestUser";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slugify";

export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  legal_name?: string;
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

  return NextResponse.json({ organizations: orgsRes.data ?? [] });
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
  const managerUsername = body.manager_username
    ? body.manager_username.trim().toLowerCase()
    : null;

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

  let managerId: string | null = null;
  if (managerUsername) {
    const managerRes = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", managerUsername)
      .maybeSingle();
    if (!managerRes.data) {
      return NextResponse.json(
        {
          error: `Verwalter „${managerUsername}“ wurde nicht gefunden. Lege den User vorher in Registrierung an.`,
        },
        { status: 400 }
      );
    }
    managerId = managerRes.data.id;
  }

  const baseSlug = slugify(name);
  const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

  const insert = await supabase
    .from("organizations")
    .insert({
      name,
      legal_name: legalName,
      slug: uniqueSlug,
      manager_id: managerId,
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

  return NextResponse.json({ organization: insert.data });
}
