"use client";

import type { ReactNode } from "react";

import type { ScraperIngest } from "@/lib/gethyped-ingest";

export default function IngestStatus({ ingest }: { ingest: ScraperIngest }) {
  const issues = [...ingest.rejectedItems, ...ingest.skippedItems].slice(0, 8);
  const tone =
    ingest.outcome === "success"
      ? "green"
      : ingest.outcome === "failed"
        ? "red"
        : "amber";
  const title =
    ingest.outcome === "success"
      ? "Übertragung erfolgreich"
      : ingest.outcome === "failed"
        ? "Übertragung fehlgeschlagen"
        : "Übertragung unvollständig";

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 ${
        tone === "green"
          ? "border-emerald-200 bg-emerald-50"
          : tone === "red"
            ? "border-red-200 bg-red-50"
            : "border-amber-200 bg-amber-50"
      }`}
    >
      <p
        className={`text-sm font-medium ${
          tone === "green"
            ? "text-emerald-900"
            : tone === "red"
              ? "text-red-800"
              : "text-amber-900"
        }`}
      >
        {title}
      </p>
      <p
        className={`text-sm ${
          tone === "green"
            ? "text-emerald-800"
            : tone === "red"
              ? "text-red-700"
              : "text-amber-800"
        }`}
      >
        {ingest.summary}
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge tone="green">{ingest.accepted} Events angekommen</Badge>
        <Badge tone={ingest.rejected > 0 ? "red" : "muted"}>
          {ingest.rejected} abgelehnt
        </Badge>
        <Badge tone="muted">{ingest.skipped} übersprungen</Badge>
        <Badge
          tone={
            ingest.imagesConfirmed != null &&
            ingest.imagesConfirmed === ingest.withImage &&
            ingest.withImage > 0
              ? "green"
              : ingest.withImage === 0
                ? "red"
                : "amber"
          }
        >
          {imageBadge(ingest)}
        </Badge>
      </div>
      <p className="text-xs text-black/40">
        {ingest.sent} Events gesendet
        {ingest.batches[0] ? ` · ${ingest.batches[0]}` : ""}
        {` · ${new Date(ingest.at).toLocaleString("de-DE")}`}
      </p>
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

function imageBadge(ingest: ScraperIngest): string {
  if (ingest.imagesConfirmed != null) {
    return `${ingest.imagesConfirmed} / ${ingest.withImage} Bilder bestätigt`;
  }
  if (ingest.withImage > 0) {
    return `${ingest.withImage} Bilder mitgeschickt, noch nicht bestätigt`;
  }
  return "Keine Bilder übertragen";
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "red" | "muted" | "amber";
}) {
  const className =
    tone === "green"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "red"
        ? "bg-red-100 text-red-700"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800"
          : "bg-black/5 text-black/55";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}
