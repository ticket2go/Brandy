"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/auth/apiFetch";
import { useSession } from "./SessionProvider";

const ORG_BUCKET = "org-assets";

type AdminOrganization = {
  id: string;
  name: string;
  legal_name: string;
  slug: string;
  logo_url: string | null;
  manager_id: string | null;
};

function logoSrc(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from(ORG_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export default function AdminPanel() {
  const router = useRouter();
  const { user, profile, loading } = useSession();
  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLegal, setCreateLegal] = useState("");
  const [createManager, setCreateManager] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const refreshOrgs = useCallback(async () => {
    setLoadingOrgs(true);
    setError(null);
    const res = await apiFetch("/api/organizations");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Konnte Organisationen nicht laden.");
      setLoadingOrgs(false);
      return;
    }
    setOrgs(json.organizations as AdminOrganization[]);
    setLoadingOrgs(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!profile?.is_admin) return;
    refreshOrgs();
  }, [loading, user, profile, refreshOrgs, router]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createBusy) return;
    const name = createName.trim();
    const legal = createLegal.trim();
    if (!name) {
      setError("Name darf nicht leer sein.");
      return;
    }
    if (!legal) {
      setError("Firmierung darf nicht leer sein.");
      return;
    }
    setCreateBusy(true);
    setError(null);
    const res = await apiFetch("/api/organizations", {
      method: "POST",
      body: JSON.stringify({
        name,
        legal_name: legal,
        manager_username: createManager.trim() || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Anlegen fehlgeschlagen.");
      setCreateBusy(false);
      return;
    }
    setCreateName("");
    setCreateLegal("");
    setCreateManager("");
    setCreateOpen(false);
    setCreateBusy(false);
    await refreshOrgs();
  };

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-5xl px-6">
        <p className="text-sm text-black/50">Lade …</p>
      </section>
    );
  }

  if (!user) return null;

  if (!profile?.is_admin) {
    return (
      <section className="mx-auto w-full max-w-5xl px-6">
        <h1 className="text-3xl font-bold text-black">Admin-Panel</h1>
        <p className="mt-3 text-sm text-black/60">
          Du bist nicht als Admin eingeloggt. Logge dich mit dem Admin-Account
          ein, um Organisationen anlegen zu können.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-fit items-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/85"
        >
          Zum Login
        </Link>
      </section>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setCreateOpen(true);
        }}
        aria-label="Neue Organisation anlegen"
        title="Neue Organisation anlegen"
        className="fixed left-6 top-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-sm transition hover:scale-105 hover:bg-black/85"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-black/40">
            Admin
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-black">
            Organisationen
          </h1>
          <p className="text-sm text-black/60">
            Lege Organisationen an und ordne ihnen einen Verwalter zu. Über das{" "}
            <kbd className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] text-black/70">
              +
            </kbd>{" "}
            oben links erstellst du neue Organisationen.
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

        {loadingOrgs ? (
          <p className="text-sm text-black/50">Lade Organisationen …</p>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-black/50">
            Noch keine Organisationen. Lege die erste mit{" "}
            <kbd className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] text-black/70">
              +
            </kbd>{" "}
            an.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orgs.map((org) => (
              <OrgRow key={org.id} org={org} onChange={refreshOrgs} />
            ))}
          </ul>
        )}
      </section>

      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Neue Organisation anlegen"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
          style={{
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
          onClick={() => !createBusy && setCreateOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-black">Neue Organisation</h2>
            <p className="mt-1 text-sm text-black/60">
              Name, Firmierung und optional einen Verwalter (Benutzername eines
              registrierten Users).
            </p>
            <form onSubmit={handleCreate} className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-black/50">
                  Name
                </span>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  disabled={createBusy}
                  autoFocus
                  className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                  placeholder="ACME"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-black/50">
                  Firmierung
                </span>
                <input
                  type="text"
                  value={createLegal}
                  onChange={(e) => setCreateLegal(e.target.value)}
                  disabled={createBusy}
                  className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                  placeholder="ACME GmbH & Co. KG"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-black/50">
                  Verwalter (optional)
                </span>
                <input
                  type="text"
                  value={createManager}
                  onChange={(e) => setCreateManager(e.target.value)}
                  disabled={createBusy}
                  className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                  placeholder="benutzername"
                />
                <span className="text-[11px] text-black/40">
                  Der User muss bereits registriert sein.
                </span>
              </label>

              <div className="mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  disabled={createBusy}
                  className="rounded-xl px-4 py-2.5 text-sm text-black/60 transition hover:bg-black/5"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={createBusy}
                  className="rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createBusy ? "Speichert …" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function OrgRow({
  org,
  onChange,
}: {
  org: AdminOrganization;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(org.name);
  const [legal, setLegal] = useState(org.legal_name);
  const [managerUsername, setManagerUsername] = useState("");
  const [managerLabel, setManagerLabel] = useState<string>("…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!org.manager_id) {
        setManagerLabel("—");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("username, full_name")
        .eq("id", org.manager_id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setManagerLabel("unbekannt");
      } else {
        setManagerLabel(data.username ?? data.full_name ?? "—");
        setManagerUsername(data.username ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.manager_id]);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/organizations/${org.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: name.trim(),
        legal_name: legal.trim(),
        manager_username: managerUsername.trim() || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Speichern fehlgeschlagen.");
      setBusy(false);
      return;
    }
    setBusy(false);
    setEditing(false);
    onChange();
  };

  const handleDelete = async () => {
    if (busy) return;
    if (
      !window.confirm(
        `Organisation „${org.name}“ wirklich löschen? Brands der Organisation verlieren ihre Zuordnung.`
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await apiFetch(`/api/organizations/${org.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Löschen fehlgeschlagen.");
      setBusy(false);
      return;
    }
    setBusy(false);
    onChange();
  };

  const handleLogoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
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
      setBusy(false);
      event.target.value = "";
      return;
    }
    const res = await apiFetch(`/api/organizations/${org.id}`, {
      method: "PATCH",
      body: JSON.stringify({ logo_url: path }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Logo konnte nicht gespeichert werden.");
      setBusy(false);
      event.target.value = "";
      return;
    }
    setBusy(false);
    event.target.value = "";
    onChange();
  };

  const src = logoSrc(org.logo_url);

  return (
    <li className="rounded-2xl border border-black/10 bg-white p-5">
      <div className="flex items-start gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-black/5">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={`${org.name} Logo`}
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <span className="text-xs uppercase tracking-widest text-black/30">
              kein Logo
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {editing ? (
            <div className="flex flex-col gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                className="rounded-md border border-black/15 px-3 py-2 text-base font-semibold text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              />
              <input
                value={legal}
                onChange={(e) => setLegal(e.target.value)}
                disabled={busy}
                className="rounded-md border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                placeholder="Firmierung"
              />
              <input
                value={managerUsername}
                onChange={(e) => setManagerUsername(e.target.value)}
                disabled={busy}
                className="rounded-md border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                placeholder="Verwalter (Username)"
              />
            </div>
          ) : (
            <>
              <h2 className="truncate text-lg font-semibold text-black">
                {org.name}
              </h2>
              <p className="truncate text-sm text-black/60">{org.legal_name}</p>
              <p className="text-xs text-black/40">
                Slug: <code className="text-black/60">{org.slug}</code> ·
                Verwalter: <span className="text-black/70">{managerLabel}</span>
              </p>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <label
            className={`cursor-pointer rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 ${
              busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            Logo hochladen
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
              disabled={busy}
            />
          </label>
          {editing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(org.name);
                  setLegal(org.legal_name);
                }}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-xs text-black/60 hover:bg-black/5"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-60"
              >
                {busy ? "…" : "Speichern"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/organizations/${org.id}`}
                className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5"
              >
                Mitglieder
              </Link>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5"
              >
                Bearbeiten
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50"
              >
                Löschen
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
