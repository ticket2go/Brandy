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

// Module-level flag: einmal erfolgreich gelaufen → bei Folgeaufrufen
// (z.B. bei jedem zweiten Login-Aufruf in der gleichen Server-Instanz)
// schnell zurückkehren. Hindert ensure-admin daran, im Hintergrund
// teure Listings/Updates zu machen, während ein User gerade eingeloggt ist.
let alreadySeeded = false;

async function ensureProfileOnly(
  supabase: SupabaseClient<Database>,
  userId: string,
  seed: SeedUser
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Nur sicherstellen, dass die Profile-Zeile existiert. Wir touchen das
  // is_admin-Flag NICHT für bereits existierende Profile mit anderen Werten,
  // damit ein bewusst angelegter Admin-Account nicht versehentlich gedowngradet
  // wird. Wenn das Profil noch nicht existiert, legen wir es mit den
  // Seed-Defaults an.
  const existing = await supabase
    .from("profiles")
    .select("id, username, is_admin, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (existing.data) {
    // Username/full_name nur setzen, wenn sie leer sind.
    const updates: {
      username?: string;
      full_name?: string;
      is_admin?: boolean;
    } = {};
    if (!existing.data.username) updates.username = seed.username;
    if (!existing.data.full_name) updates.full_name = seed.fullName;
    // is_admin nur setzen, wenn nicht gesetzt UND seed-Account ein Admin ist.
    // (Wir schalten niemanden runter, aber wir reparieren ein fehlendes Flag.)
    if (seed.isAdmin && existing.data.is_admin !== true) {
      updates.is_admin = true;
    }
    if (Object.keys(updates).length > 0) {
      const upd = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId);
      if (upd.error) return { ok: false, error: upd.error.message };
    }
    return { ok: true };
  }

  const insert = await supabase.from("profiles").upsert(
    {
      id: userId,
      username: seed.username,
      full_name: seed.fullName,
      is_admin: seed.isAdmin,
    },
    { onConflict: "id" }
  );
  if (insert.error) return { ok: false, error: insert.error.message };
  return { ok: true };
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

  // WICHTIG: Wenn der Auth-User existiert, ändern wir sein Passwort NICHT.
  // Frühere Versionen riefen hier `auth.admin.updateUserById` mit
  // `password` auf und im Fehlerfall sogar `deleteUserCompletely`.
  // Das konnte aktive Sessions (z.B. die des gerade eingeloggten Admins)
  // invalidieren – das war der Grund, warum Tab-Wechsel zum Auto-Logout
  // führten und /login die Eingabe verlor. Stattdessen synchronisieren
  // wir nur die Profil-Zeile.
  if (existing) {
    const profile = await ensureProfileOnly(supabase, existing.id, seed);
    if (!profile.ok) return profile;
    return { ok: true, userId: existing.id };
  }

  const fresh = await createFreshUser(supabase, seed);
  if (!fresh.ok) return fresh;
  const profile = await ensureProfileOnly(supabase, fresh.userId, seed);
  if (!profile.ok) return profile;
  return { ok: true, userId: fresh.userId };
}

// Idempotent: legt die Demo-Accounts (admin/admin, marcel/Marcel,
// hannes/Hannes) an, falls sie noch nicht existieren. Bestehende
// Auth-User werden NICHT angefasst (kein password-update, kein delete),
// damit aktive Sessions nicht invalidiert werden.
export async function POST() {
  if (alreadySeeded) {
    return NextResponse.json({ ok: true, cached: true });
  }

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

  if (Object.keys(errors).length === 0) {
    alreadySeeded = true;
  }

  return NextResponse.json({
    ok: Object.keys(errors).length === 0,
    users: results,
    errors: Object.keys(errors).length === 0 ? undefined : errors,
  });
}
