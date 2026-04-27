"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/auth/apiFetch";
import { useSession } from "./SessionProvider";
import ManagerTagInput from "./ManagerTagInput";

const ORG_BUCKET = "org-assets";

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
  logo_url: string | null;
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

function logoSrc(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from(ORG_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

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

  // Org-Edit (Name / Firmierung)
  const [editingOrg, setEditingOrg] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftLegal, setDraftLegal] = useState("");
  const [draftManagers, setDraftManagers] = useState<string[]>([]);
  const [savingOrg, setSavingOrg] = useState(false);

  // Logo-Upload
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    const orgRes = await supabase
      .from("organizations")
      .select("id, name, legal_name, slug, logo_url, manager_id")
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
  const isPrimaryManager = !!org && org.manager_id === user?.id;
  const isMemberManager = members.some(
    (m) => m.user_id === user?.id && m.role === "manager"
  );
  const isManager = isPrimaryManager || isMemberManager;
  const canManage = isAdmin || isManager;
  const canEditOrg = isAdmin || isManager;

  const managerMembers = members.filter((m) => m.role === "manager");

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
    if (!window.confirm(`„${label}" aus der Organisation entfernen?`)) return;
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

  const startEditOrg = () => {
    if (!org) return;
    setDraftName(org.name);
    setDraftLegal(org.legal_name);
    setDraftManagers(
      managerMembers
        .map((m) => m.profile?.username ?? "")
        .filter(Boolean)
    );
    setEditingOrg(true);
    setError(null);
  };

  const cancelEditOrg = () => {
    if (savingOrg) return;
    setEditingOrg(false);
  };

  const saveOrg = async () => {
    if (!org || savingOrg) return;
    const name = draftName.trim();
    const legal = draftLegal.trim();
    if (!name) {
      setError("Name darf nicht leer sein.");
      return;
    }
    if (!legal) {
      setError("Firmierung darf nicht leer sein.");
      return;
    }
    setSavingOrg(true);
    setError(null);
    const body: {
      name: string;
      legal_name: string;
      manager_usernames?: string[];
    } = {
      name,
      legal_name: legal,
    };
    if (isAdmin) {
      body.manager_usernames = draftManagers;
    }
    const res = await apiFetch(`/api/organizations/${organizationId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Speichern fehlgeschlagen.");
      setSavingOrg(false);
      return;
    }
    setSavingOrg(false);
    setEditingOrg(false);
    await refresh();
  };

  const handleLogoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !org) return;
    setUploadingLogo(true);
    setError(null);
    const ext = file.name.split(".").pop() || "png";
    const path = `${org.slug}/logo-${Date.now()}.${ext}`;
    const upload = await supabase.storage
      .from(ORG_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || undefined,
      });
    if (upload.error) {
      setError(upload.error.message);
      setUploadingLogo(false);
      event.target.value = "";
      return;
    }
    const res = await apiFetch(`/api/organizations/${organizationId}`, {
      method: "PATCH",
      body: JSON.stringify({ logo_url: path }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Logo konnte nicht gespeichert werden.");
      setUploadingLogo(false);
      event.target.value = "";
      return;
    }
    setUploadingLogo(false);
    event.target.value = "";
    await refresh();
  };

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-5xl px-6">
        <p className="text-sm text-black/50">Lade …</p>
      </section>
    );
  }
  if (!user) return null;

  const orgLogo = logoSrc(org?.logo_url ?? null);

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
          {org?.name ?? "Organisation"}
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

      {org && canEditOrg && (
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="flex items-start gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-black/5">
              {orgLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={orgLogo}
                  alt={`${org.name} Logo`}
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="text-[10px] uppercase tracking-widest text-black/30">
                  kein Logo
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-black">
                    Organisation bearbeiten
                  </h2>
                  <p className="text-xs text-black/50">
                    {isAdmin
                      ? "Als Admin kannst du Name, Firmierung, Logo und Verwalter ändern."
                      : "Als Verwalter:in kannst du Name, Firmierung und Logo ändern."}
                  </p>
                </div>
                {!editingOrg && (
                  <button
                    type="button"
                    onClick={startEditOrg}
                    className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5"
                  >
                    Bearbeiten
                  </button>
                )}
              </div>

              {editingOrg ? (
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-black/50">
                      Name
                    </span>
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      disabled={savingOrg}
                      className="rounded-md border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-black/50">
                      Firmierung
                    </span>
                    <input
                      value={draftLegal}
                      onChange={(e) => setDraftLegal(e.target.value)}
                      disabled={savingOrg}
                      className="rounded-md border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                    />
                  </label>
                  {isAdmin && (
                    <ManagerTagInput
                      label="Verwalter (mehrere möglich)"
                      values={draftManagers}
                      onChange={setDraftManagers}
                      disabled={savingOrg}
                      placeholder="Verwalter (Benutzername)"
                      helperText="Tippe zur dynamischen Suche und wähle Verwalter aus."
                    />
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEditOrg}
                      disabled={savingOrg}
                      className="rounded-md px-3 py-1.5 text-xs text-black/60 hover:bg-black/5"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      onClick={saveOrg}
                      disabled={savingOrg}
                      className="rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-60"
                    >
                      {savingOrg ? "Speichert …" : "Speichern"}
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-black/40">
                      Name
                    </dt>
                    <dd className="text-black">{org.name}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-black/40">
                      Firmierung
                    </dt>
                    <dd className="text-black">{org.legal_name}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-black/40">
                      {managerMembers.length > 1
                        ? "Verwalter:innen"
                        : "Verwalter:in"}
                    </dt>
                    <dd className="text-black">
                      {managerMembers.length === 0
                        ? "—"
                        : managerMembers
                            .map(
                              (m) =>
                                m.profile?.username ??
                                m.profile?.full_name ??
                                "—"
                            )
                            .join(", ")}
                    </dd>
                  </div>
                </dl>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-3">
                <label
                  className={`cursor-pointer rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 ${
                    uploadingLogo ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  {uploadingLogo ? "Lädt hoch …" : "Logo hochladen"}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                  />
                </label>

                {/* Platzhalter für später: Schriften & weitere Logos für
                    Präsentationsdateien. Wir legen die Buttons schon an,
                    damit der Workflow sichtbar ist – die Implementierung
                    folgt mit den Präsentations-Vorlagen. */}
                <button
                  type="button"
                  disabled
                  title="Folgt mit den Präsentations-Vorlagen"
                  className="cursor-not-allowed rounded-md border border-dashed border-black/15 px-3 py-1.5 text-xs font-medium text-black/40"
                >
                  Schriften hochladen (bald)
                </button>
                <button
                  type="button"
                  disabled
                  title="Folgt mit den Präsentations-Vorlagen"
                  className="cursor-not-allowed rounded-md border border-dashed border-black/15 px-3 py-1.5 text-xs font-medium text-black/40"
                >
                  Weitere Logos hochladen (bald)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-black">
          Mitglieder & Rollen
        </h2>
      </header>

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
            const isPrimary = org?.manager_id === m.user_id;
            const isMgr = m.role === "manager";
            return (
              <li
                key={m.id}
                className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-black">
                    {label}
                    {isMgr && (
                      <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-black/70">
                        Verwalter
                      </span>
                    )}
                    {isPrimary && (
                      <span
                        className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white"
                        title="Haupt-Verwalter (manager_id)"
                      >
                        Haupt
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
