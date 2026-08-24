"use client";

import { useEffect, useState } from "react";

import { loadGethypedToken, saveGethypedToken } from "@/lib/gethyped-ingest";

type Props = {
  className?: string;
};

export default function GethypedTokenField({ className }: Props) {
  const [token, setToken] = useState("");

  useEffect(() => {
    setToken(loadGethypedToken());
  }, []);

  const update = (value: string) => {
    setToken(value);
    saveGethypedToken(value);
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
      <span className="text-xs text-black/40">
        Wird in diesem Browser gespeichert. Du kannst ihn jederzeit ändern.
      </span>
    </label>
  );
}
