"use client";

import Link from "next/link";

import type { Scraper } from "@/lib/scrapers";

type ScraperCardProps = {
  scraper: Scraper;
  running: boolean;
  following: boolean;
  onRun: () => void;
  onFollowUps: () => void;
  onDelete: () => void;
};

export default function ScraperCard({
  scraper,
  running,
  following,
  onRun,
  onFollowUps,
  onDelete,
}: ScraperCardProps) {
  const busy = running || following;
  const hasEntries = scraper.preview.length > 0 || scraper.events.length > 0;
  const followUp = scraper.followUp;
  const followDone = followUp
    ? followUp.groups.filter(
        (group) => group.status === "done" || group.status === "error"
      ).length
    : 0;
  const followTotal = followUp?.groups.length ?? 0;

  return (
    <article className="flex w-full max-w-xl flex-col gap-4 rounded-2xl bg-black p-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/eventscraper/${scraper.id}`}
            className="text-xl font-semibold tracking-tight text-white hover:text-white/80"
          >
            {scraper.name}
          </Link>
          <p className="mt-1 truncate text-[12px] text-white/50" title={scraper.url}>
            {scraper.url}
          </p>
          <p className="mt-1 text-[12px] text-white/50">
            {running
              ? "Suchseite …"
              : following || followUp?.running
                ? `${followDone}/${followTotal} Unterseiten · ${scraper.entryCount} Events`
                : scraper.entryCount === 1
                  ? "1 Event"
                  : `${scraper.entryCount} Events`}
            {scraper.lastRunAt && !busy
              ? ` · ${new Date(scraper.lastRunAt).toLocaleString("de-DE")}`
              : ""}
          </p>
          {scraper.error && !busy ? (
            <p className="mt-1 text-[11px] text-red-300">{scraper.error}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={busy}
            className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black transition enabled:hover:bg-white/90 disabled:opacity-50"
          >
            {running ? "Läuft …" : "Scrapen"}
          </button>
          <button
            type="button"
            onClick={onFollowUps}
            disabled={busy || !hasEntries}
            className="rounded-full bg-white/15 px-4 py-2 text-[12px] font-semibold text-white transition enabled:hover:bg-white/25 disabled:opacity-40"
          >
            {following || followUp?.running
              ? `${followDone}/${followTotal}`
              : "Unterseiten Scrapen"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Scraper „${scraper.name}“ löschen`}
            title="Löschen"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 2L10 10M10 2L2 10"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}
