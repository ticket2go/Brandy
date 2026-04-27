"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase/client";
import {
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from "@/lib/auth/usernameEmail";
import { useSession } from "./SessionProvider";

export default function LoginForm() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ensuredRef = useRef(false);

  useEffect(() => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;
    fetch("/api/auth/ensure-admin", { method: "POST" }).catch(() => {
      // ignore – Login-Form bleibt benutzbar, Fehler kommt sonst beim Login
    });
  }, []);

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [user, router]);

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
    if (!password) {
      setError("Passwort darf nicht leer sein.");
      return;
    }

    setBusy(true);
    const email = usernameToEmail(u);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
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
          placeholder="z.B. admin"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-black/50">
          Passwort
        </span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
          placeholder="••••••••"
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
        {busy ? "Melde an …" : "Einloggen"}
      </button>

      <p className="mt-2 text-center text-sm text-black/60">
        Noch keinen Account?{" "}
        <Link
          href="/register"
          className="font-semibold text-black underline decoration-dotted underline-offset-4 hover:decoration-solid"
        >
          Jetzt registrieren
        </Link>
      </p>
    </form>
  );
}
