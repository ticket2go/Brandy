"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import Title from "@/components/Title";
import { formatEventDay } from "@/lib/event-format";
import {
  eventGroupKey,
  findEventGroup,
  withTourUrl,
  type EventGroup,
} from "@/lib/event-groups";
import { scrapeEventsFromUrl } from "@/lib/event-scraper-run";
import {
  getScraper,
  updateScraperSource,
  type EventScraper,
  type ScraperSource,
} from "@/lib/event-scrapers";

type EventscraperEventDetailProps = {
  scraperId: string;
  eventId: string;
};

export default function EventscraperEventDetail({
  scraperId,
  eventId,
}: EventscraperEventDetailProps) {
  const [scraper, setScraper] = useState<EventScraper | null>(null);
  const [group, setGroup] = useState<EventGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyScraper = useCallback(
    (next: EventScraper | null) => {
      setScraper(next);
      if (!next) {
        setGroup(null);
        return;
      }
      for (const item of next.sources) {
        const found = findEventGroup(item.events, eventId);
        if (found) {
          setGroup(found);
          return;
        }
      }
      setGroup(null);
    },
    [eventId]
  );

  useEffect(() => {
    applyScraper(getScraper(scraperId));
    setReady(true);
  }, [applyScraper, scraperId]);

  useEffect(() => {
    if (!ready) return;
    const current = getScraper(scraperId);
    if (!current) return;

    let foundSource: ScraperSource | null = null;
    let foundGroup: EventGroup | null = null;
    for (const item of current.sources) {
      const nextGroup = findEventGroup(item.events, eventId);
      if (nextGroup) {
        foundSource = item;
        foundGroup = nextGroup;
        break;
      }
    }
    if (!foundSource || !foundGroup?.tourUrl) return;

    let cancelled = false;
    const tourUrl = foundGroup.tourUrl;
    const productGroupId = foundGroup.dates[0]?.productGroupId ?? null;
    const sourceId = foundSource.id;
    const existing = foundSource.events;

    const loadFollowUp = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await scrapeEventsFromUrl(tourUrl);
        if (cancelled) return;
        if (result.events.length === 0) {
          if (result.error) setError(result.error);
          return;
        }
        const incoming = withTourUrl(result.events, tourUrl, productGroupId);
        const kept = existing.filter(
          (event) => eventGroupKey(event) !== eventId
        );
        const nextEvents = [...kept, ...incoming];
        const next = updateScraperSource(scraperId, sourceId, {
          events: nextEvents,
          entryCount: nextEvents.length,
          lastScrapedAt: new Date().toISOString(),
          error: result.error,
        });
        if (next) applyScraper(next);
        if (result.error) setError(result.error);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Folgeseite konnte nicht geladen werden."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadFollowUp();
    return () => {
      cancelled = true;
    };
  }, [applyScraper, eventId, ready, scraperId]);

  if (!ready) {
    return (
      <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
        <section className="mx-auto w-full max-w-5xl px-6">
          <p className="text-sm text-black/50">Lade …</p>
        </section>
      </main>
    );
  }

  if (!scraper || !group) {
    return (
      <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6">
          <h1 className="text-3xl font-semibold text-black">
            Event nicht gefunden
          </h1>
          <p className="text-sm text-black/60">
            Dieser Eintrag existiert in diesem Browser nicht (mehr).
          </p>
          <Link
            href={scraper ? `/eventscraper/${scraper.id}` : "/eventscraper"}
            className="w-fit rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-black/85"
          >
            Zurück
          </Link>
        </section>
      </main>
    );
  }

  const image = group.heroImage || group.image;
  const dates = [...group.dates].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? "")
  );

  return (
    <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6">
        <nav className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-black/40">
          <Link href="/" className="hover:text-black">
            Projekte
          </Link>
          <span>/</span>
          <Link href="/eventscraper" className="hover:text-black">
            Eventscraper
          </Link>
          <span>/</span>
          <Link href={`/eventscraper/${scraper.id}`} className="hover:text-black">
            {scraper.name}
          </Link>
          <span>/</span>
          <span className="text-black/70">{group.name}</span>
        </nav>
        <Title text={group.name} />
        <p className="text-sm text-black/60">
          {loading
            ? "Lädt Folgeseite …"
            : dates.length === 1
              ? "1 Termin von der Folgeseite"
              : `${dates.length} Termine von der Folgeseite`}
        </p>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-64 w-full rounded-3xl object-cover sm:h-80"
          />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-3xl bg-black/[0.04] text-sm text-black/40">
            Kein Herobild
          </div>
        )}

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-black">
            Städte
          </h2>
          {group.cities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {group.cities.map((city) => (
                <span
                  key={city}
                  className="rounded-full bg-black px-4 py-2 text-sm text-white"
                >
                  {city}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-black/50">Keine Städte gefunden.</p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-black">
            Termine
          </h2>
          {dates.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {dates.map((event, index) => (
                <li
                  key={`${event.url ?? event.date ?? event.city ?? index}`}
                  className="flex flex-col gap-1 rounded-2xl bg-black px-5 py-4 text-white"
                >
                  <p className="text-base font-semibold tracking-tight">
                    {formatEventDay(event.date) ?? "Kein Datum"}
                  </p>
                  <p className="text-sm text-white/65">
                    {event.location || "Kein Ort"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/50">Keine Termine gefunden.</p>
          )}
        </div>
      </section>
    </main>
  );
}
