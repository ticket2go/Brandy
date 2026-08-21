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
import {
  eventFieldsFromEvents,
  fetchEventimEvents,
  isEventimUrl,
  type EventimEvent,
} from "@/lib/eventim";

const GROUP_LABELS: Record<ProbeGroup, string> = {
  event: "Eventdaten",
  param: "Parameter",
  jsonld: "Strukturierte Daten",
  meta: "Meta",
  page: "Seiteninhalt",
};

const GROUP_ORDER: ProbeGroup[] = ["event", "param", "jsonld", "meta", "page"];

type EventscraperDetailProps = {
  id: string;
};

export default function EventscraperDetail({ id }: EventscraperDetailProps) {
  const [scraper, setScraper] = useState<EventScraper | null>(null);
  const [ready, setReady] = useState(false);
  const [fields, setFields] = useState<ProbeField[]>([]);
  const [events, setEvents] = useState<EventimEvent[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

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
      setWarning(null);
      try {
        const response = await fetch("/api/eventscraper/probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: scraper.url }),
        });
        const payload = (await response.json()) as {
          fields?: ProbeField[];
          events?: EventimEvent[];
          warning?: string | null;
          error?: string;
        };
        if (cancelled) return;

        let nextEvents = payload.events ?? [];
        let nextFields = payload.fields ?? [];
        let nextWarning = payload.warning ?? null;

        if (
          isEventimUrl(scraper.url) &&
          nextEvents.length === 0
        ) {
          try {
            nextEvents = await fetchEventimEvents(scraper.url);
            nextFields = mergeFields(
              nextFields,
              eventFieldsFromEvents(nextEvents)
            );
            if (nextEvents.length > 0) nextWarning = null;
          } catch {
            // Browser-Fallback: wenn CORS oder Eventim blockt, Server-Warnung behalten.
          }
        }

        if (!response.ok && nextEvents.length === 0 && nextFields.length === 0) {
          throw new Error(payload.error ?? "URL konnte nicht gelesen werden.");
        }

        setFields((prev) => mergeFields(prev, nextFields));
        setEvents(nextEvents);
        setWarning(nextWarning);
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
        {loading && (
          <p className="text-sm text-black/50">Lese Eventdaten …</p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {warning && !error && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </p>
        )}

        {events.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-black">
              Datenfeed
            </h2>
            <p className="text-sm text-black/55">
              Gefundene Events mit Name, Datum und Bild.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event, index) => (
                <article
                  key={`${event.url ?? event.name}-${index}`}
                  className="overflow-hidden rounded-2xl bg-black text-white"
                >
                  {event.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.image}
                      alt=""
                      className="h-36 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center bg-white/5 text-xs text-white/40">
                      Kein Bild
                    </div>
                  )}
                  <div className="flex flex-col gap-1 p-4">
                    <h3 className="text-base font-semibold tracking-tight">
                      {event.name}
                    </h3>
                    <p className="text-[12px] text-white/60">
                      {[formatEventDate(event.date), event.venue, event.city]
                        .filter(Boolean)
                        .join(" · ") || "Kein Datum"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-black">
              Voreinstellungen
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Wähle die Eventdaten, die später gescraped werden sollen.
            </p>
          </div>
          <p className="text-sm text-black/50">
            {selected.length === 1
              ? "1 Voreinstellung hinterlegt"
              : `${selected.length} Voreinstellungen hinterlegt`}
          </p>
        </div>

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
                const isImage = field.key === "event.image" && !!field.sample;
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
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={field.sample ?? ""}
                        alt=""
                        className="mt-1 h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <span
                        className={`line-clamp-2 text-[12px] ${
                          isSelected ? "text-white/60" : "text-black/45"
                        }`}
                      >
                        {field.key === "event.date"
                          ? formatEventDate(field.sample) ?? "Kein Beispielwert"
                          : field.sample ?? "Kein Beispielwert"}
                      </span>
                    )}
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

function formatEventDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
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
