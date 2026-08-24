"use client";

import type { ReactNode } from "react";

import type { ScraperIngest } from "@/lib/gethyped-ingest";

export default function IngestStatus({ ingest }: { ingest: ScraperIngest }) {
  const issues = [...ingest.rejectedItems, ...ingest.skippedItems].slice(0, 8);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-black/10 px-4 py-3">
      <p className="text-sm font-medium text-black">Letzte Lieferung an GetHyped</p>
      <div className="flex flex-wrap gap-2">
        <Badge tone="green">{ingest.accepted} angenommen</Badge>
        <Badge tone="red">{ingest.rejected} abgelehnt</Badge>
        <Badge tone="muted">{ingest.skipped} übersprungen</Badge>
        {ingest.batches.length > 0 ? (
          <Badge tone="dark">{ingest.batches.length} Batch</Badge>
        ) : null}
      </div>
      {ingest.error ? (
        <p className="text-sm text-red-700">{ingest.error}</p>
      ) : (
        <p className="text-xs text-black/40">
          {ingest.sent} Events gesendet
          {ingest.batches[0] ? ` · ${ingest.batches[0]}` : ""}
          {` · ${new Date(ingest.at).toLocaleString("de-DE")}`}
        </p>
      )}
      {issues.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1 text-xs text-black/55">
          {issues.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span className="font-medium text-black/70">{item.name}</span>
              {`: ${item.reason}`}
            </li>
          ))}
        </ul>
      ) : null}
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
