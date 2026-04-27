"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { useSession } from "./SessionProvider";

const ORG_BUCKET = "org-assets";

function resolveOrgLogoSrc(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from(ORG_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const ROLE_LABELS: Record<string, string> = {
  manager: "Verwalter",
  geschaeftsfuehrung: "Geschäftsführung",
  projektmanagement: "Projektmanagement",
  grafik: "Grafik",
  marketing: "Marketing",
  mitglied: "Mitglied",
};

export default function AccountPanel() {
  const router = useRouter();
  const { user, profile, memberships, loading, signOut, refresh } =
    useSession();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6">
        <p className="text-sm text-black/50">Lade …</p>
      </section>
    );
  }
  if (!user) return null;

  const displayName =
    profile?.full_name?.trim() || profile?.username || "Mein Account";

  const startEdit = () => {
    setError(null);
    setDraft(profile?.full_name ?? "");
    setEditing(true);
  };

  const cancelEdit = () => {
    if (saving) return;
    setEditing(false);
    setDraft("");
    setError(null);
  };

  const commitEdit = async () => {
    if (!user || saving) return;
    const trimmed = draft.trim();
    if (trimmed === (profile?.full_name ?? "")) {
      cancelEdit();
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: trimmed.length > 0 ? trimmed : null })
      .eq("id", user.id);
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    await refresh();
    setSaving(false);
    setEditing(false);
    setDraft("");
  };

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-black/40">
          Account
        </span>
        <div className="flex min-w-0 items-center gap-2">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitEdit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                }
              }}
              disabled={saving}
              placeholder={profile?.username ?? "Dein Name"}
              aria-label="Anzeigename bearbeiten"
              className="m-0 min-w-0 rounded-md border border-black/15 bg-white px-2 py-1 text-4xl font-bold tracking-tight text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
            />
          ) : (
            <h1 className="m-0 truncate text-4xl font-bold tracking-tight text-black">
              {displayName}
            </h1>
          )}
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              aria-label="Namen bearbeiten"
              title="Namen bearbeiten"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-black/30 transition hover:bg-black/5 hover:text-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9.5 2.2l2.3 2.3M2.5 11.5L3 9l6.5-6.5a1.2 1.2 0 0 1 1.7 0l.3.3a1.2 1.2 0 0 1 0 1.7L5 11l-2.5.5z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        <p className="text-sm text-black/60">
          Eingeloggt als{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12px] text-black/80">
            {profile?.username ?? "—"}
          </code>
          {profile?.is_admin && (
            <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              Admin
            </span>
          )}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        )}
      </header>

      <div className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-black">Organisationen</h2>
        {memberships.length === 0 ? (
          <p className="mt-2 text-sm text-black/60">
            Du gehörst noch keiner Organisation an. Ein Admin oder ein
            Verwalter kann dich hinzufügen.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {memberships.map((m) => {
              const logoSrc = resolveOrgLogoSrc(m.organization.logo_url);
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-black/10 bg-white px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-black/5">
                      {logoSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logoSrc}
                          alt={`${m.organization.name} Logo`}
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-black/30">
                          {m.organization.name.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold text-black">
                        B.{m.organization.name}
                      </span>
                      <span className="truncate text-xs text-black/50">
                        {m.organization.legal_name}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-black/70">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        {profile?.is_admin && (
          <Link
            href="/admin"
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/85"
          >
            Admin-Panel
          </Link>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await signOut();
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error("[AccountPanel] signOut failed", err);
            }
            if (typeof window !== "undefined") {
              window.location.assign("/login");
            } else {
              router.replace("/login");
            }
          }}
          className="rounded-xl border border-black/15 px-4 py-2 text-sm text-black/70 transition hover:bg-black/5"
        >
          Logout
        </button>
      </div>
    </section>
  );
}
