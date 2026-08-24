"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import ScraperPreview from "@/components/ScraperPreview";
import Title from "@/components/Title";
import {
  applyScraperSelection,
  loadScraperPreview,
  runScraper,
} from "@/lib/run-scraper";
import { FIELD_LABELS, type ScrapedEvent, type ScraperField } from "@/lib/scraped-event";
import { getScraper, type Scraper, type ScraperSelection } from "@/lib/scrapers";

type ScraperDetailProps = {
  id: string;
};

export default function ScraperDetail({ id }: ScraperDetailProps) {
  const [scraper, setScraper] = useState<Scraper | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<ScraperSelection | null>(null);
  const autoLoad = useRef(false);

  useEffect(() => {
    const current = getScraper(id);
    setScraper(current);
    setSelection(current?.selection ?? null);
    setReady(true);
  }, [id]);

  useEffect(() => {
    if (!scraper || autoLoad.current) return;
    if (scraper.preview.length > 0) return;
    autoLoad.current = true;
    void handleLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scraper]);

  const persist = (next: Scraper | null) => {
    if (!next) return;
    setScraper(next);
    setSelection(next.selection);
  };

  const handleLoad = async () => {
    if (!scraper) return;
    setLoading(true);
    try {
      persist(await loadScraperPreview(scraper));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!scraper || !selection) return;
    persist(applyScraperSelection(scraper, selection));
  };

  const handleRerun = async () => {
    if (!scraper) return;
    setLoading(true);
    try {
      const withSelection = selection
        ? { ...scraper, selection }
        : scraper;
      persist(await runScraper(withSelection));
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
        <section className="mx-auto w-full max-w-6xl px-6">
          <p className="text-sm text-black/50">Lade …</p>
        </section>
      </main>
    );
  }

  if (!scraper || !selection) {
    return (
      <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6">
          <h1 className="text-3xl font-semibold text-black">
            Scraper nicht gefunden
          </h1>
          <p className="text-sm text-black/60">
            Dieser Scraper existiert in diesem Browser nicht (mehr).
          </p>
          <Link
            href="/eventscraper"
            className="w-fit rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-black/85"
          >
            Zur Übersicht
          </Link>
        </section>
      </main>
    );
  }

  const selectedCount = selection.selectAll
    ? scraper.preview.length
    : selection.itemIds.length;

  return (
    <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6">
        <nav className="flex items-center gap-2 text-xs uppercase tracking-widest text-black/40">
          <Link href="/" className="hover:text-black">
            Projekte
          </Link>
          <span>/</span>
          <Link href="/eventscraper" className="hover:text-black">
            Eventscraper
          </Link>
          <span>/</span>
          <span className="text-black/70">{scraper.name}</span>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Title text={scraper.name} />
            <p className="mt-2 truncate text-sm text-black/50" title={scraper.url}>
              {scraper.url}
            </p>
            <p className="mt-1 text-sm text-black/60">
              {loading
                ? "Seite und Folgeseiten werden geladen …"
                : scraper.preview.length === 0
                  ? "Die Seite wird als Preview geladen."
                  : "Klicke Events und Felder an, die übernommen werden sollen."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLoad}
              disabled={loading}
              className="rounded-full border border-black/15 px-5 py-3 text-sm font-semibold text-black transition enabled:hover:bg-black/5 disabled:opacity-50"
            >
              {scraper.preview.length > 0 ? "Aktualisieren" : "Seite laden"}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={loading || scraper.preview.length === 0}
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition enabled:hover:bg-black/85 disabled:opacity-50"
            >
              Übernehmen
              {selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6">
        {scraper.error && !loading ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {scraper.error}
          </p>
        ) : null}
        {scraper.warning && !loading ? (
          <p className="rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-sm text-black/60">
            {scraper.warning}
          </p>
        ) : null}

        {scraper.preview.length === 0 ? (
          <p className="text-sm text-black/50">
            {loading
              ? "Einträge und Folgeseiten werden gelesen …"
              : "Noch keine Preview. Lade die Seite, um Einträge auszuwählen."}
          </p>
        ) : (
          <ScraperPreview
            preview={scraper.preview}
            selection={selection}
            onChange={setSelection}
          />
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-black">Tabelle</h2>
              <p className="text-sm text-black/50">
                {scraper.events.length === 1
                  ? "1 übernommenes Event"
                  : `${scraper.events.length} übernommene Events`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRerun}
              disabled={loading}
              className="w-fit text-sm font-medium text-black/60 underline decoration-black/20 hover:text-black hover:decoration-black disabled:opacity-50"
            >
              Auswahl neu scrapen
            </button>
          </div>

          {scraper.events.length === 0 ? (
            <p className="text-sm text-black/45">
              Noch nichts übernommen. Wähle Einträge in der Preview und klicke
              Übernehmen.
            </p>
          ) : (
            <EventsTable
              events={scraper.events}
              fields={selection.fields}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function EventsTable({
  events,
  fields,
}: {
  events: ScrapedEvent[];
  fields: ScraperField[];
}) {
  const columns = fields.length > 0 ? fields : (["name"] as ScraperField[]);
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-black/[0.04] text-[10px] uppercase tracking-[0.12em] text-black/45">
          <tr>
            {columns.map((field) => (
              <th
                key={field}
                className={`px-4 py-3 font-medium ${
                  field === "price" ? "text-right" : ""
                }`}
              >
                {FIELD_LABELS[field]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => (
            <tr
              key={`${event.ticketUrl ?? event.name}-${event.startsAt ?? index}`}
              className="border-t border-black/5 align-top"
            >
              {columns.map((field) => (
                <td
                  key={field}
                  className={`px-4 py-3 ${
                    field === "name" ? "font-medium text-black" : "text-black/70"
                  } ${
                    field === "date" || field === "time" || field === "price"
                      ? "whitespace-nowrap"
                      : ""
                  } ${field === "price" ? "text-right" : ""}`}
                >
                  <TableCell event={event} field={field} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCell({
  event,
  field,
}: {
  event: ScrapedEvent;
  field: ScraperField;
}) {
  if (field === "heroImage") return <UrlCell url={event.heroImage} />;
  if (field === "ticketUrl") return <UrlCell url={event.ticketUrl} />;
  const value =
    field === "name"
      ? event.name
      : field === "location"
        ? event.location
        : field === "date"
          ? event.date
          : field === "time"
            ? event.time
            : event.price;
  return <>{value || "—"}</>;
}

function UrlCell({ url }: { url: string | null }) {
  if (!url) return <span className="text-black/40">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="block max-w-[7.5rem] truncate text-black/60 underline decoration-black/20 hover:decoration-black"
    >
      {url}
    </a>
  );
}
