import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidUsername, normalizeUsername, usernameToEmail } from "@/lib/auth/usernameEmail";

export const dynamic = "force-dynamic";

type Body = {
  username?: string;
  password?: string;
  full_name?: string;
  organization_slug?: string | null;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const username = normalizeUsername(body.username ?? "");
  const password = body.password ?? "";
  const fullName = (body.full_name ?? "").trim();
  const orgSlug = body.organization_slug ? body.organization_slug.trim() : null;

  if (!isValidUsername(username)) {
    return NextResponse.json(
      {
        error:
          "Ungültiger Benutzername. Erlaubt: 3–40 Zeichen, Buchstaben, Zahlen, . _ -",
      },
      { status: 400 }
    );
  }

  if (password.length < 4) {
    return NextResponse.json(
      { error: "Passwort muss mindestens 4 Zeichen haben." },
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

  const existing = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }
  if (existing.data) {
    return NextResponse.json(
      { error: "Benutzername bereits vergeben." },
      { status: 409 }
    );
  }

  const email = usernameToEmail(username);
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || username,
      username,
    },
  });
  if (created.error || !created.data.user) {
    return NextResponse.json(
      { error: created.error?.message ?? "Registrierung fehlgeschlagen." },
      { status: 500 }
    );
  }

  const userId = created.data.user.id;

  await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        username,
        full_name: fullName || username,
        is_admin: false,
      },
      { onConflict: "id" }
    )
    .select("id")
    .single();

  // Optional: Direkt einer Organisation zuordnen (Self-Service-Einladung)
  if (orgSlug) {
    const orgRes = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .maybeSingle();
    if (orgRes.data) {
      await supabase
        .from("organization_members")
        .upsert(
          {
            organization_id: orgRes.data.id,
            user_id: userId,
            role: "mitglied",
          },
          { onConflict: "organization_id,user_id" }
        );
    }
  }

  return NextResponse.json({ ok: true, user_id: userId });
}
