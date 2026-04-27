import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth/usernameEmail";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type SeedUser = {
  username: string;
  password: string;
  fullName: string;
  isAdmin: boolean;
};

const SEED_USERS: SeedUser[] = [
  { username: "admin", password: "admin", fullName: "Admin", isAdmin: true },
  {
    username: "marcel",
    password: "Marcel",
    fullName: "Marcel",
    isAdmin: false,
  },
  {
    username: "hannes",
    password: "Hannes",
    fullName: "Hannes",
    isAdmin: false,
  },
];

async function deleteUserCompletely(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  // Vor dem Auth-Delete erst die Profil-Spuren entfernen, sonst kann ein
  // FK-Constraint (organization_members.user_id → profiles.id) zicken.
  await supabase
    .from("organization_members")
    .delete()
    .eq("user_id", userId);
  await supabase.from("profiles").delete().eq("id", userId);
  await supabase.auth.admin.deleteUser(userId);
}

async function createFreshUser(
  supabase: SupabaseClient<Database>,
  seed: SeedUser
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const email = usernameToEmail(seed.username);
  const created = await supabase.auth.admin.createUser({
    email,
    password: seed.password,
    email_confirm: true,
    user_metadata: {
      full_name: seed.fullName,
      username: seed.username,
    },
  });
  if (created.error || !created.data.user) {
    return {
      ok: false,
      error:
        created.error?.message ??
        `Account "${seed.username}" konnte nicht angelegt werden.`,
    };
  }
  return { ok: true, userId: created.data.user.id };
}

async function ensureUser(
  supabase: SupabaseClient<Database>,
  existingUsers: User[],
  seed: SeedUser
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const email = usernameToEmail(seed.username);
  const lower = email.toLowerCase();
  const existing = existingUsers.find(
    (u) => (u.email ?? "").toLowerCase() === lower
  );

  let userId: string;
  if (existing) {
    userId = existing.id;
    const upd = await supabase.auth.admin.updateUserById(userId, {
      password: seed.password,
      email_confirm: true,
      ban_duration: "none",
    });
    if (upd.error) {
      // Self-heal: Wenn der bestehende Account kaputt ist (z.B. weil
      // er per direktem SQL-Insert ohne korrekte auth.identities-Zeile
      // angelegt wurde), löschen wir ihn und legen ihn frisch an.
      // eslint-disable-next-line no-console
      console.warn(
        `[ensure-admin] update failed for ${seed.username}, recreating:`,
        upd.error.message
      );
      try {
        await deleteUserCompletely(supabase, userId);
      } catch {
        // ignore – der frische createUser unten wird ggf. den
        // eigentlichen Fehler zurückgeben.
      }
      const fresh = await createFreshUser(supabase, seed);
      if (!fresh.ok) return fresh;
      userId = fresh.userId;
    }
  } else {
    const fresh = await createFreshUser(supabase, seed);
    if (!fresh.ok) return fresh;
    userId = fresh.userId;
  }

  const upsert = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        username: seed.username,
        full_name: seed.fullName,
        is_admin: seed.isAdmin,
      },
      { onConflict: "id" }
    )
    .select("id")
    .single();
  if (upsert.error) {
    return { ok: false, error: upsert.error.message };
  }

  return { ok: true, userId };
}

// Idempotent: legt die Demo-Accounts (admin/admin und marcel/Marcel) an
// und setzt das passende is_admin-Flag. Wird beim ersten Aufruf der
// Login-Seite getriggert, damit das Setup ohne manuelle Schritte
// funktioniert.
export async function POST() {
  let supabase: SupabaseClient<Database>;
  try {
    supabase = createServerSupabaseClient();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server config fehlt" },
      { status: 500 }
    );
  }

  const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) {
    return NextResponse.json({ error: list.error.message }, { status: 500 });
  }

  const results: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const seed of SEED_USERS) {
    const res = await ensureUser(supabase, list.data.users, seed);
    if (res.ok) {
      results[seed.username] = res.userId;
    } else {
      errors[seed.username] = res.error;
    }
  }

  return NextResponse.json({
    ok: Object.keys(errors).length === 0,
    users: results,
    errors: Object.keys(errors).length === 0 ? undefined : errors,
  });
}
