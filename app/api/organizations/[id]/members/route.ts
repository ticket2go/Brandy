import { NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/getRequestUser";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ROLES = [
  "manager",
  "grafik",
  "projektmanagement",
  "marketing",
  "geschaeftsfuehrung",
  "mitglied",
] as const;
type Role = (typeof ROLES)[number];

type AddBody = {
  username?: string;
  role?: Role;
};

async function loadAuthContext(userId: string, orgId: string) {
  const supabase = createServerSupabaseClient();
  const [profileRes, orgRes] = await Promise.all([
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
  ]);
  return {
    supabase,
    isAdmin: !!profileRes.data?.is_admin,
    isManager: !!orgRes.data && orgRes.data.manager_id === userId,
    org: orgRes.data,
  };
}

export async function GET(
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
      { error: error instanceof Error ? error.message : "Server config fehlt." },
      { status: 500 }
    );
  }
  if (!ctx.org) {
    return NextResponse.json({ error: "Organisation nicht gefunden." }, { status: 404 });
  }

  // Mitglied der Org darf seine Org-Members sehen.
  const ownMember = await ctx.supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ctx.isAdmin && !ctx.isManager && !ownMember.data) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const res = await ctx.supabase
    .from("organization_members")
    .select(
      "id, organization_id, user_id, role, profile:profiles(id, username, full_name)"
    )
    .eq("organization_id", params.id)
    .order("role", { ascending: true });
  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }
  return NextResponse.json({ members: res.data ?? [] });
}

export async function POST(
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
      { error: error instanceof Error ? error.message : "Server config fehlt." },
      { status: 500 }
    );
  }
  if (!ctx.org) {
    return NextResponse.json({ error: "Organisation nicht gefunden." }, { status: 404 });
  }
  if (!ctx.isAdmin && !ctx.isManager) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  let body: AddBody;
  try {
    body = (await request.json()) as AddBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const username = (body.username ?? "").trim().toLowerCase();
  const role = (body.role ?? "mitglied") as Role;
  if (!username) {
    return NextResponse.json({ error: "Benutzername fehlt." }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
  }

  const profileRes = await ctx.supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();
  if (!profileRes.data) {
    return NextResponse.json(
      { error: `User „${username}“ wurde nicht gefunden.` },
      { status: 404 }
    );
  }

  const upsert = await ctx.supabase
    .from("organization_members")
    .upsert(
      {
        organization_id: params.id,
        user_id: profileRes.data.id,
        role,
      },
      { onConflict: "organization_id,user_id" }
    )
    .select(
      "id, organization_id, user_id, role, profile:profiles(id, username, full_name)"
    )
    .single();
  if (upsert.error) {
    return NextResponse.json({ error: upsert.error.message }, { status: 500 });
  }

  return NextResponse.json({ member: upsert.data });
}
