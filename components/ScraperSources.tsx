"use client";

import { useState, type FormEvent } from "react";

import {
  addScraperSource,
  normalizeScraperUrl,
  removeScraperSource,
  type EventScraper,
  type ScraperSource,
} from "@/lib/event-scrapers";

type ScraperSourcesProps = {
  scraper: EventScraper;
  generatingId: string | null;
  onChange: (scraper: EventScraper) => void;
  onGenerate: (source: ScraperSource) => void;
  compact?: boolean;
};

export default function ScraperSources({
  scraper,
  generatingId,
  onChange,
  onGenerate,
  compact = false,
}: ScraperSourcesProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const normalized = normalizeScraperUrl(url);
    if (!normalized) {
      setError("Bitte eine gültige URL angeben.");
      return;
    }
    const next = addScraperSource(scraper.id, normalized);
    if (!next) return;
    setUrl("");
    setError(null);
    onChange(next);
  };

  const handleRemove = (sourceId: string) => {
    const next = removeScraperSource(scraper.id, sourceId);
    if (next) onChange(next);
  };

  return (
    <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
      <ul className="flex flex-col gap-2">
        {scraper.sources.map((source) => {
          const busy = generatingId === source.id;
          return (
            <li
              key={source.id}
              className={
                compact
                  ? "rounded-xl bg-white/5 px-3 py-2"
                  : "rounded-2xl border border-black/10 bg-white px-4 py-3"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[12px] ${
                      compact ? "text-white/70" : "text-black/70"
                    }`}
                    title={source.url}
                  >
                    {source.url}
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] ${
                      compact ? "text-white/45" : "text-black/45"
                    }`}
                  >
                    {source.entryCount === 1
                      ? "1 Eintrag"
                      : `${source.entryCount} Einträge`}
                    {source.lastScrapedAt
                      ? ` · ${new Date(source.lastScrapedAt).toLocaleString("de-DE")}`
                      : ""}
                  </p>
                  {source.error && (
                    <p className="mt-1 text-[11px] text-red-400">
                      {source.error}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={(click) => {
                      click.preventDefault();
                      click.stopPropagation();
                      onGenerate(source);
                    }}
                    disabled={busy}
                    className={
                      compact
                        ? "rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition enabled:hover:bg-white/90 disabled:opacity-50"
                        : "rounded-full bg-black px-3 py-1.5 text-[11px] font-semibold text-white transition enabled:hover:bg-black/85 disabled:opacity-50"
                    }
                  >
                    {busy ? "Läuft …" : "Generieren"}
                  </button>
                  {scraper.sources.length > 1 && (
                    <button
                      type="button"
                      onClick={(click) => {
                        click.preventDefault();
                        click.stopPropagation();
                        handleRemove(source.id);
                      }}
                      aria-label="Link entfernen"
                      className={
                        compact
                          ? "text-[11px] text-white/40 hover:text-red-300"
                          : "text-[11px] text-black/35 hover:text-red-600"
                      }
                    >
                      Entfernen
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <label htmlFor={`add-link-${scraper.id}`} className="sr-only">
          Weiteren Link hinzufügen
        </label>
        <input
          id={`add-link-${scraper.id}`}
          type="text"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Weiteren Link hinzufügen …"
          className={
            compact
              ? "min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white placeholder:text-white/35 outline-none focus:border-white/40"
              : "min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 text-[12px] text-black placeholder:text-black/35 outline-none focus:border-black/40"
          }
        />
        <button
          type="submit"
          className={
            compact
              ? "rounded-full bg-white/15 px-3 py-2 text-[11px] font-semibold text-white hover:bg-white/25"
              : "rounded-full bg-black px-3 py-2 text-[11px] font-semibold text-white hover:bg-black/85"
          }
        >
          Hinzufügen
        </button>
      </form>
      {error && (
        <p className={`text-[11px] ${compact ? "text-red-300" : "text-red-600"}`}>
          {error}
        </p>
      )}
    </div>
  );
}
