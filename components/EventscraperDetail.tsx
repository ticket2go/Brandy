"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ScraperSources from "./ScraperSources";
import Title from "@/components/Title";
import {
  fieldsFromUrl,
  type ProbeField,
  type ProbeGroup,
} from "@/lib/event-scraper-fields";
import {
  getScraper,
  scraperEntryCount,
  updateScraper,
  type EventScraper,
} from "@/lib/event-scrapers";
import { eventFieldsFromEvents, type EventimEvent } from "@/lib/eventim";
import { useScraperGenerate } from "@/lib/use-scraper-generate";

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
  const [selected, setSelected] = useState<string[]>([]);
  const { generatingId, generateSource, generateAll } = useScraperGenerate();

  const syncFromScraper = useCallback((next: EventScraper) => {
    setScraper(next);
    const events = next.sources.flatMap((source) => source.events);
    setFields((prev) =>
      mergeFields(
        [
          ...next.sources.flatMap((source) => fieldsFromUrl(source.url)),
          ...eventFieldsFromEvents(events),
        ],
        prev
      )
    );
  }, []);

  useEffect(() => {
    const found = getScraper(id);
    setSelected(found?.selectedFields ?? []);
    if (found) syncFromScraper(found);
    setReady(true);
  }, [id, syncFromScraper]);

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

  const total = scraperEntryCount(scraper);
  const busy = generatingId !== null;

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Title text={scraper.name} />
            <p className="mt-2 text-sm text-black/60">
              {total === 1
                ? "1 Eintrag gescraped"
                : `${total} Einträge gescraped`}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const next = await generateAll(scraper);
              if (next) syncFromScraper(next);
            }}
            disabled={busy}
            className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition enabled:hover:bg-black/85 disabled:opacity-50"
          >
            {busy ? "Generiert …" : "Generieren"}
          </button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-black">
            Links
          </h2>
          <p className="text-sm text-black/55">
            Weitere Suchlinks hinzufügen und pro Link separat generieren.
          </p>
          <ScraperSources
            scraper={scraper}
            generatingId={generatingId}
            onChange={syncFromScraper}
            onGenerate={async (source) => {
              const next = await generateSource(scraper.id, source);
              if (next) syncFromScraper(next);
            }}
          />
        </div>

        {scraper.sources.map((source) => (
          <SourceFeed
            key={source.id}
            url={source.url}
            events={source.events}
            count={source.entryCount}
            error={source.error}
            generating={generatingId === source.id}
          />
        ))}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-black">
              Voreinstellungen
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Wähle die Eventdaten, die gescraped werden sollen.
            </p>
          </div>
          <p className="text-sm text-black/50">
            {selected.length === 1
              ? "1 Voreinstellung hinterlegt"
              : `${selected.length} Voreinstellungen hinterlegt`}
          </p>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-black/50">
            Nach dem Generieren erscheinen hier die gefundenen Felder.
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

function SourceFeed({
  url,
  events,
  count,
  error,
  generating,
}: {
  url: string;
  events: EventimEvent[];
  count: number;
  error: string | null;
  generating: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-black">
          Datenfeed
        </h2>
        <p className="mt-1 truncate text-sm text-black/50" title={url}>
          {url}
        </p>
        <p className="mt-1 text-sm text-black/60">
          {generating
            ? "Generiert …"
            : count === 1
              ? "1 Eintrag gescraped"
              : `${count} Einträge gescraped`}
        </p>
      </div>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {events.length > 0 ? (
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
                  {event.location || "Keine Location"}
                </p>
                <p className="text-[12px] text-white/60">
                  {formatEventDate(event.date) ?? "Kein Datum"}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !generating &&
        !error && (
          <p className="text-sm text-black/50">
            Noch keine Einträge. Starte das Scraping mit Generieren.
          </p>
        )
      )}
    </div>
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
