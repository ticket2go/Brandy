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
];

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
    // Sicherstellen, dass das Passwort dem Seed entspricht – bequem fürs
    // Demo, falls jemand das Passwort versehentlich verändert hat.
    const upd = await supabase.auth.admin.updateUserById(userId, {
      password: seed.password,
      email_confirm: true,
    });
    if (upd.error) {
      return { ok: false, error: upd.error.message };
    }
  } else {
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
    userId = created.data.user.id;
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
  for (const seed of SEED_USERS) {
    const res = await ensureUser(supabase, list.data.users, seed);
    if (!res.ok) {
      return NextResponse.json(
        { error: `${seed.username}: ${res.error}` },
        { status: 500 }
      );
    }
    results[seed.username] = res.userId;
  }

  return NextResponse.json({ ok: true, users: results });
}
