"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "./SessionProvider";

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
  const { user, profile, memberships, loading, signOut } = useSession();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6">
        <p className="text-sm text-black/50">Lade …</p>
      </section>
    );
  }
  if (!user) return null;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-black/40">
          Account
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-black">
          {profile?.full_name ?? profile?.username ?? "Mein Account"}
        </h1>
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
            {memberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-black">
                    B. {m.organization.name}
                  </span>
                  <span className="text-xs text-black/50">
                    {m.organization.legal_name}
                  </span>
                </div>
                <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-black/70">
                  {ROLE_LABELS[m.role] ?? m.role}
                </span>
              </li>
            ))}
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
            } finally {
              router.replace("/login");
              router.refresh();
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
