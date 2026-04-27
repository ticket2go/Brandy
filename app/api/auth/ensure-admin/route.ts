import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth/usernameEmail";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin";

export const dynamic = "force-dynamic";

// Idempotent: legt einen Admin-Account "admin" / "admin" an (falls noch nicht
// vorhanden) und stellt sicher, dass dessen Profil das Flag is_admin=true hat.
// Wird beim ersten Aufruf der Login-Seite gerufen, damit der Bootstrap-Admin
// existiert, ohne dass jemand manuell ein Setup-Skript ausführen muss.
export async function POST() {
  let supabase;
  try {
    supabase = createServerSupabaseClient();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server config fehlt" },
      { status: 500 }
    );
  }

  const email = usernameToEmail(ADMIN_USERNAME);

  let userId: string | null = null;

  const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) {
    return NextResponse.json({ error: list.error.message }, { status: 500 });
  }
  const existing = list.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    userId = existing.id;
  } else {
    const created = await supabase.auth.admin.createUser({
      email,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Admin", username: ADMIN_USERNAME },
    });
    if (created.error || !created.data.user) {
      return NextResponse.json(
        {
          error:
            created.error?.message ?? "Admin-Account konnte nicht angelegt werden.",
        },
        { status: 500 }
      );
    }
    userId = created.data.user.id;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Admin-User-ID konnte nicht ermittelt werden." },
      { status: 500 }
    );
  }

  // Profil sicherstellen (Trigger handle_new_user erzeugt es zwar, aber
  // beim Update auf is_admin/username brauchen wir es definitiv).
  const upsertProfile = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        username: ADMIN_USERNAME,
        full_name: "Admin",
        is_admin: true,
      },
      { onConflict: "id" }
    )
    .select("id, username, is_admin")
    .single();

  if (upsertProfile.error) {
    return NextResponse.json(
      { error: upsertProfile.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, profile: upsertProfile.data });
}
