"use client";

import { useEffect, useRef, useState } from "react";

import { fetchStoredToken, storeToken } from "@/lib/gethyped-token";

type SaveState = "idle" | "saving" | "saved" | "local";

export default function GethypedTokenField({
  className,
}: {
  className?: string;
}) {
  const [token, setToken] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchStoredToken().then((stored) => {
      if (!cancelled) setToken(stored);
    });
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const update = (value: string) => {
    setToken(value);
    setState("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void storeToken(value).then((inDb) => {
        setState(inDb ? "saved" : "local");
      });
    }, 500);
  };

  return (
    <label
      className={`flex max-w-xl flex-col gap-1 text-sm text-black/60 ${className ?? ""}`}
    >
      GetHyped-Token
      <input
        type="text"
        value={token}
        onChange={(event) => update(event.target.value)}
        placeholder="Bearer-Token der Event-Quelle"
        autoComplete="off"
        spellCheck={false}
        className="rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-sm text-black outline-none focus:border-black/30"
      />
      <span className="text-xs text-black/40" aria-live="polite">
        {state === "saving"
          ? "Wird gespeichert …"
          : state === "saved"
            ? "In der Datenbank gespeichert."
            : state === "local"
              ? "Nur in diesem Browser gespeichert – Migration 0017_app_settings.sql fehlt."
              : "Liegt in der Datenbank und gilt für alle Browser. Jederzeit änderbar."}
      </span>
    </label>
  );
}
