"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Title from "@/components/Title";
import {
  fieldsFromUrl,
  type ProbeField,
  type ProbeGroup,
} from "@/lib/event-scraper-fields";
import { getScraper, updateScraper, type EventScraper } from "@/lib/event-scrapers";

const GROUP_LABELS: Record<ProbeGroup, string> = {
  param: "Parameter",
  jsonld: "Strukturierte Daten",
  meta: "Meta",
  page: "Seiteninhalt",
};

const GROUP_ORDER: ProbeGroup[] = ["param", "jsonld", "meta", "page"];

type EventscraperDetailProps = {
  id: string;
};

export default function EventscraperDetail({ id }: EventscraperDetailProps) {
  const [scraper, setScraper] = useState<EventScraper | null>(null);
  const [ready, setReady] = useState(false);
  const [fields, setFields] = useState<ProbeField[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const found = getScraper(id);
    setScraper(found);
    setSelected(found?.selectedFields ?? []);
    if (found) {
      setFields(fieldsFromUrl(found.url));
    }
    setReady(true);
  }, [id]);

  useEffect(() => {
    if (!scraper) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/eventscraper/probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: scraper.url }),
        });
        const payload = (await response.json()) as {
          fields?: ProbeField[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "URL konnte nicht gelesen werden.");
        }
        if (cancelled) return;
        setFields((prev) => mergeFields(prev, payload.fields ?? []));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "URL konnte nicht gelesen werden."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [scraper]);

  const persistSelection = useCallback(
    (next: string[]) => {
      setSelected(next);
      updateScraper(id, { selectedFields: next });
    },
    [id]
  );

  const toggleField = (key: string) => {
    persistSelection(
      selected.includes(key)
        ? selected.filter((item) => item !== key)
        : [...selected, key]
    );
  };

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABELS[group],
      items: fields.filter((field) => field.group === group),
    })).filter((entry) => entry.items.length > 0);
  }, [fields]);

  if (!ready) {
    return (
      <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
        <section className="mx-auto w-full max-w-5xl px-6">
          <p className="text-sm text-black/50">Lade …</p>
        </section>
      </main>
    );
  }

  if (!scraper) {
    return (
      <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6">
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
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6">
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
        <Title text={scraper.name} />
        <p className="truncate text-sm text-black/50" title={scraper.url}>
          {scraper.url}
        </p>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-black">
              Voreinstellungen
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Wähle die Parameter und Datenfelder, die später gescraped werden
              sollen.
            </p>
          </div>
          <p className="text-sm text-black/50">
            {selected.length === 1
              ? "1 Voreinstellung hinterlegt"
              : `${selected.length} Voreinstellungen hinterlegt`}
          </p>
        </div>

        {loading && (
          <p className="text-sm text-black/50">Lese URL und sammle Daten …</p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {!loading && fields.length === 0 && !error ? (
          <p className="text-sm text-black/50">
            Auf dieser URL wurden noch keine scrapbaren Parameter gefunden.
          </p>
        ) : null}

        {grouped.map((entry) => (
          <div key={entry.group} className="flex flex-col gap-3">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.12em] text-black/40">
              {entry.label}
            </h3>
            <div className="flex flex-wrap gap-3">
              {entry.items.map((field) => {
                const isSelected = selected.includes(field.key);
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => toggleField(field.key)}
                    aria-pressed={isSelected}
                    className={`flex min-h-[5.5rem] w-full max-w-xs flex-col items-start gap-1 rounded-2xl px-4 py-3 text-left transition ${
                      isSelected
                        ? "bg-black text-white"
                        : "bg-black/[0.04] text-black hover:bg-black/[0.08]"
                    }`}
                  >
                    <span className="text-sm font-semibold tracking-tight">
                      {field.label}
                    </span>
                    <span
                      className={`line-clamp-2 text-[12px] ${
                        isSelected ? "text-white/60" : "text-black/45"
                      }`}
                    >
                      {field.sample ?? "Kein Beispielwert"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function mergeFields(current: ProbeField[], incoming: ProbeField[]): ProbeField[] {
  const map = new Map<string, ProbeField>();
  for (const field of [...current, ...incoming]) {
    const existing = map.get(field.key);
    if (!existing || (!existing.sample && field.sample)) {
      map.set(field.key, field);
    }
  }
  return Array.from(map.values());
}
