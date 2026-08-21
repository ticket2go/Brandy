"use client";

import Link from "next/link";

import ScraperSources from "./ScraperSources";
import {
  scraperEntryCount,
  type EventScraper,
  type ScraperSource,
} from "@/lib/event-scrapers";

type EventscraperCardProps = {
  scraper: EventScraper;
  generatingId: string | null;
  onChange: (scraper: EventScraper) => void;
  onGenerate: (source: ScraperSource) => void;
  onGenerateAll: () => void;
  onDelete?: () => void;
};

export default function EventscraperCard({
  scraper,
  generatingId,
  onChange,
  onGenerate,
  onGenerateAll,
  onDelete,
}: EventscraperCardProps) {
  const total = scraperEntryCount(scraper);
  const busy = generatingId !== null;

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
          <p className="mt-1 text-[12px] text-white/50">
            {total === 1 ? "1 Eintrag gescraped" : `${total} Einträge gescraped`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onGenerateAll}
            disabled={busy}
            className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black transition enabled:hover:bg-white/90 disabled:opacity-50"
          >
            {busy ? "Läuft …" : "Generieren"}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Scraper „${scraper.name}“ löschen`}
              title="Löschen"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-red-500/20 hover:text-red-300"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2 2L10 10M10 2L2 10"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <ScraperSources
        scraper={scraper}
        generatingId={generatingId}
        onChange={onChange}
        onGenerate={onGenerate}
        compact
      />
    </article>
  );
}
