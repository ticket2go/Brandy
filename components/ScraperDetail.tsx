"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Title from "@/components/Title";
import { runScraper } from "@/lib/run-scraper";
import { getScraper, type Scraper } from "@/lib/scrapers";

type ScraperDetailProps = {
  id: string;
};

export default function ScraperDetail({ id }: ScraperDetailProps) {
  const [scraper, setScraper] = useState<Scraper | null>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setScraper(getScraper(id));
    setReady(true);
  }, [id]);

  const handleRun = async () => {
    if (!scraper) return;
    setRunning(true);
    try {
      const next = await runScraper(scraper);
      if (next) setScraper(next);
    } finally {
      setRunning(false);
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

  if (!scraper) {
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
              {running
                ? "Scraped Städteseite und Folgeseiten …"
                : scraper.entryCount === 1
                  ? "1 Event gefunden"
                  : `${scraper.entryCount} Events gefunden`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition enabled:hover:bg-black/85 disabled:opacity-50"
          >
            {running ? "Läuft …" : "Scrapen"}
          </button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6">
        {scraper.error && !running ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {scraper.error}
          </p>
        ) : null}

        {scraper.events.length === 0 ? (
          <p className="text-sm text-black/50">
            {running
              ? "Daten werden geladen …"
              : "Noch keine Events. Starte den Scraper mit Scrapen."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/10">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-black/[0.04] text-[10px] uppercase tracking-[0.12em] text-black/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Eventname</th>
                  <th className="px-4 py-3 font-medium">Ort</th>
                  <th className="px-4 py-3 font-medium">Datum</th>
                  <th className="px-4 py-3 font-medium">Uhrzeit</th>
                  <th className="px-4 py-3 font-medium">Eventherobild</th>
                  <th className="px-4 py-3 font-medium">Ticketlink</th>
                  <th className="px-4 py-3 text-right font-medium">Preis</th>
                </tr>
              </thead>
              <tbody>
                {scraper.events.map((event, index) => (
                  <tr
                    key={`${event.ticketUrl ?? event.name}-${event.startsAt ?? index}`}
                    className="border-t border-black/5 align-top"
                  >
                    <td className="px-4 py-3 font-medium text-black">{event.name}</td>
                    <td className="px-4 py-3 text-black/70">
                      {event.location ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-black/70">
                      {event.date ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-black/70">
                      {event.time ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <UrlCell url={event.heroImage} />
                    </td>
                    <td className="px-4 py-3">
                      <UrlCell url={event.ticketUrl} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-black/70">
                      {event.price ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
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
