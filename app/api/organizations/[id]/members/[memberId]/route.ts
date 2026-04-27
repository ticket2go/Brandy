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

async function authContext(userId: string, orgId: string) {
  const supabase = createServerSupabaseClient();
  const [profile, org] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle(),
    supabase
      .from("organizations")
      .select("id, manager_id")
      .eq("id", orgId)
      .maybeSingle(),
  ]);
  return {
    supabase,
    isAdmin: !!profile.data?.is_admin,
    isManager: !!org.data && org.data.manager_id === userId,
    org: org.data,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; memberId: string } }
) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  let ctx;
  try {
    ctx = await authContext(user.id, params.id);
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

  let body: { role?: Role };
  try {
    body = (await request.json()) as { role?: Role };
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  if (!body.role || !ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
  }

  const upd = await ctx.supabase
    .from("organization_members")
    .update({ role: body.role })
    .eq("id", params.memberId)
    .eq("organization_id", params.id)
    .select(
      "id, organization_id, user_id, role, profile:profiles(id, username, full_name)"
    )
    .single();
  if (upd.error) {
    return NextResponse.json({ error: upd.error.message }, { status: 500 });
  }
  return NextResponse.json({ member: upd.data });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; memberId: string } }
) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  let ctx;
  try {
    ctx = await authContext(user.id, params.id);
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

  const del = await ctx.supabase
    .from("organization_members")
    .delete()
    .eq("id", params.memberId)
    .eq("organization_id", params.id);
  if (del.error) {
    return NextResponse.json({ error: del.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
