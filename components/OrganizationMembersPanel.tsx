"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/auth/apiFetch";
import { useSession } from "./SessionProvider";

const ROLES = [
  { key: "manager", label: "Verwalter (manager)" },
  { key: "geschaeftsfuehrung", label: "Geschäftsführung" },
  { key: "projektmanagement", label: "Projektmanagement" },
  { key: "grafik", label: "Grafik" },
  { key: "marketing", label: "Marketing" },
  { key: "mitglied", label: "Mitglied" },
] as const;
type Role = (typeof ROLES)[number]["key"];

type Organization = {
  id: string;
  name: string;
  legal_name: string;
  slug: string;
  manager_id: string | null;
};

type Member = {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  profile: {
    id: string;
    username: string | null;
    full_name: string | null;
  } | null;
};

type Props = {
  organizationId: string;
};

export default function OrganizationMembersPanel({ organizationId }: Props) {
  const router = useRouter();
  const { user, profile, loading } = useSession();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addUsername, setAddUsername] = useState("");
  const [addRole, setAddRole] = useState<Role>("mitglied");
  const [addBusy, setAddBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    const orgRes = await supabase
      .from("organizations")
      .select("id, name, legal_name, slug, manager_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgRes.error) {
      setError(orgRes.error.message);
      setLoadingData(false);
      return;
    }
    setOrg(orgRes.data as Organization | null);

    const res = await apiFetch(`/api/organizations/${organizationId}/members`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Konnte Mitglieder nicht laden.");
      setMembers([]);
      setLoadingData(false);
      return;
    }
    setMembers((json.members ?? []) as Member[]);
    setLoadingData(false);
  }, [organizationId]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    refresh();
  }, [loading, user, refresh, router]);

  const isAdmin = !!profile?.is_admin;
  const isManager = !!org && org.manager_id === user?.id;
  const canManage = isAdmin || isManager;

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addBusy) return;
    const u = addUsername.trim().toLowerCase();
    if (!u) {
      setError("Benutzername fehlt.");
      return;
    }
    setAddBusy(true);
    setError(null);
    const res = await apiFetch(
      `/api/organizations/${organizationId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ username: u, role: addRole }),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Hinzufügen fehlgeschlagen.");
      setAddBusy(false);
      return;
    }
    setAddUsername("");
    setAddRole("mitglied");
    setAddBusy(false);
    await refresh();
  };

  const handleRoleChange = async (memberId: string, role: Role) => {
    const res = await apiFetch(
      `/api/organizations/${organizationId}/members/${memberId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Rolle konnte nicht geändert werden.");
      return;
    }
    refresh();
  };

  const handleRemove = async (memberId: string, label: string) => {
    if (!window.confirm(`„${label}“ aus der Organisation entfernen?`)) return;
    const res = await apiFetch(
      `/api/organizations/${organizationId}/members/${memberId}`,
      { method: "DELETE" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Entfernen fehlgeschlagen.");
      return;
    }
    refresh();
  };

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-5xl px-6">
        <p className="text-sm text-black/50">Lade …</p>
      </section>
    );
  }
  if (!user) return null;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6">
      <nav className="flex items-center gap-2 text-xs uppercase tracking-widest text-black/40">
        {isAdmin && (
          <Link href="/admin" className="hover:text-black">
            Admin
          </Link>
        )}
        {isAdmin && <span>/</span>}
        <span className="text-black/70">{org?.name ?? "Organisation"}</span>
      </nav>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-black">
          Mitglieder & Rollen
        </h1>
        <p className="text-sm text-black/60">
          {org
            ? `${org.legal_name} · Slug: ${org.slug}`
            : "Lade Organisations-Daten …"}
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {canManage && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-5 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-black/50">
              Benutzername
            </span>
            <input
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              disabled={addBusy}
              className="rounded-md border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              placeholder="benutzername"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-black/50">
              Rolle
            </span>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as Role)}
              disabled={addBusy}
              className="rounded-md border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            >
              {ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={addBusy}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {addBusy ? "Füge hinzu …" : "Hinzufügen"}
          </button>
        </form>
      )}

      {loadingData ? (
        <p className="text-sm text-black/50">Lade Mitglieder …</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-black/50">
          Diese Organisation hat noch keine Mitglieder.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const label =
              m.profile?.username ?? m.profile?.full_name ?? m.user_id;
            const isOrgManager = org?.manager_id === m.user_id;
            return (
              <li
                key={m.id}
                className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-black">
                    {label}
                    {isOrgManager && (
                      <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-black/70">
                        Verwalter
                      </span>
                    )}
                  </span>
                  {m.profile?.full_name && m.profile?.username && (
                    <span className="text-xs text-black/50">
                      {m.profile.full_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? (
                    <select
                      value={m.role}
                      onChange={(e) =>
                        handleRoleChange(m.id, e.target.value as Role)
                      }
                      className="rounded-md border border-black/15 px-2 py-1 text-xs text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                    >
                      {ROLES.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-black/60">
                      {ROLES.find((r) => r.key === m.role)?.label ?? m.role}
                    </span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleRemove(m.id, label)}
                      className="rounded-md px-2 py-1 text-xs text-red-700 transition hover:bg-red-50"
                    >
                      Entfernen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
