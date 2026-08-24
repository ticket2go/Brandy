"use client";

import type { ReactNode } from "react";

import type { ScraperUpdate } from "@/lib/event-diff";

export default function UpdateStatus({ update }: { update: ScraperUpdate }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-black/10 px-4 py-3">
      <p className="text-sm font-medium text-black">Letztes Update</p>
      <div className="flex flex-wrap gap-2">
        <Badge tone="dark">{update.updated} aktualisiert</Badge>
        <Badge tone="green">{update.added} neu</Badge>
        <Badge tone="red">{update.removed} gelöscht</Badge>
        <Badge tone="muted">{update.unchanged} unverändert</Badge>
      </div>
      <p className="text-xs text-black/40">
        {new Date(update.at).toLocaleString("de-DE")}
      </p>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "dark" | "green" | "red" | "muted";
}) {
  const className =
    tone === "dark"
      ? "bg-black text-white"
      : tone === "green"
        ? "bg-emerald-100 text-emerald-800"
        : tone === "red"
          ? "bg-red-100 text-red-700"
          : "bg-black/5 text-black/55";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}
