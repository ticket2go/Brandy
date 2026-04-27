"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase/client";
import {
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from "@/lib/auth/usernameEmail";
import { useSession } from "./SessionProvider";

export default function RegisterForm() {
  const router = useRouter();
  const { refresh } = useSession();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const u = normalizeUsername(username);
    if (!isValidUsername(u)) {
      setError(
        "Benutzername ist ungültig. Erlaubt: 3–40 Zeichen, Buchstaben, Zahlen, . _ -"
      );
      return;
    }
    if (password.length < 4) {
      setError("Passwort muss mindestens 4 Zeichen haben.");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: u,
        password,
        full_name: fullName.trim(),
        organization_slug: orgSlug.trim() || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(json.error ?? "Registrierung fehlgeschlagen.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(u),
      password,
    });
    if (signInError) {
      setBusy(false);
      setError(signInError.message);
      return;
    }
    await refresh();
    router.replace("/");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-black/50">
          Benutzername
        </span>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
          placeholder="z.B. max.muster"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-black/50">
          Voller Name
        </span>
        <input
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={busy}
          className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
          placeholder="Max Mustermann"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-black/50">
          Passwort
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
          placeholder="mindestens 4 Zeichen"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-black/50">
          Organisations-Slug (optional)
        </span>
        <input
          type="text"
          value={orgSlug}
          onChange={(e) => setOrgSlug(e.target.value)}
          disabled={busy}
          className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
          placeholder="z.B. acme"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-2 inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Registriere …" : "Account anlegen"}
      </button>

      <p className="mt-2 text-center text-sm text-black/60">
        Schon registriert?{" "}
        <Link
          href="/login"
          className="font-semibold text-black underline decoration-dotted underline-offset-4 hover:decoration-solid"
        >
          Zum Login
        </Link>
      </p>
    </form>
  );
}
