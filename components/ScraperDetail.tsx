"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import FollowUpStatus from "@/components/FollowUpStatus";
import GethypedTokenField from "@/components/GethypedTokenField";
import IngestStatus from "@/components/IngestStatus";
import ScraperPreview from "@/components/ScraperPreview";
import SearchStatus from "@/components/SearchStatus";
import Title from "@/components/Title";
import UpdateStatus from "@/components/UpdateStatus";
import { ingestToGethyped, loadGethypedToken } from "@/lib/gethyped-ingest";
import { canResumeFollowUp, followUpProgressOf } from "@/lib/follow-up";
import {
  makeSearchProgress,
  type SearchProgress,
} from "@/lib/search-progress";
import {
  loadScraperPreview,
  runScraper,
  scrapeScraperFollowUps,
  updateScraperEntries,
} from "@/lib/run-scraper";
import {
  getScraper,
  hydrateScrapers,
  updateScraper,
  type Scraper,
} from "@/lib/scrapers";

type ScraperDetailProps = {
  id: string;
};

export default function ScraperDetail({ id }: ScraperDetailProps) {
  const [scraper, setScraper] = useState<Scraper | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(
    null
  );
  const autoLoad = useRef(false);
  const stopFollowUps = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hydrateScrapers().then(() => {
      if (cancelled) return;
      const current = getScraper(id);
      if (current?.followUp?.running) {
        setScraper(
          updateScraper(
            id,
            {
              followUp: { ...current.followUp, running: false },
            },
            { persistEvents: false }
          )
        );
      } else {
        setScraper(current);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
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
  };

  const handleLoad = async () => {
    if (!scraper) return;
    setLoading(true);
    try {
      persist(
        await loadScraperPreview(scraper, (progress, events) => {
          setSearchProgress(progress);
          if (events) persist(getScraper(id));
        })
      );
    } finally {
      setSearchProgress(null);
      setLoading(false);
    }
  };

  const handleRerun = async () => {
    if (!scraper) return;
    setLoading(true);
    try {
      persist(
        await runScraper(scraper, (progress, events) => {
          setSearchProgress(progress);
          if (events) persist(getScraper(id));
        })
      );
    } finally {
      setSearchProgress(null);
      setLoading(false);
    }
  };

  const handleFollowUps = async () => {
    if (!scraper) return;
    const controller = new AbortController();
    stopFollowUps.current = controller;
    setFollowing(true);
    try {
      persist(
        await scrapeScraperFollowUps(
          scraper,
          (_progress, next) => persist(next),
          controller.signal
        )
      );
    } finally {
      if (stopFollowUps.current === controller) stopFollowUps.current = null;
      setFollowing(false);
    }
  };

  const handleUpdate = async () => {
    if (!scraper) return;
    const controller = new AbortController();
    stopFollowUps.current = controller;
    setUpdating(true);
    try {
      persist(
        await updateScraperEntries(
          scraper,
          (_progress, next) => persist(next),
          controller.signal,
          (progress, events) => {
            setSearchProgress(progress);
            if (events) persist(getScraper(id));
          }
        )
      );
    } finally {
      if (stopFollowUps.current === controller) stopFollowUps.current = null;
      setSearchProgress(null);
      setUpdating(false);
    }
  };

  const handleStopFollowUps = () => {
    stopFollowUps.current?.abort();
  };

  const handleIngest = async () => {
    if (!scraper) return;
    const events =
      scraper.preview.length > 0 ? scraper.preview : scraper.events;
    if (events.length === 0) return;
    setIngesting(true);
    try {
      const ingest = await ingestToGethyped(events, loadGethypedToken());
      persist(updateScraper(scraper.id, { lastIngest: ingest }));
    } catch (error) {
      persist(
        updateScraper(scraper.id, {
          lastIngest: {
            at: new Date().toISOString(),
            sent: 0,
            accepted: 0,
            rejected: 0,
            skipped: 0,
            withImage: 0,
            batches: [],
            error:
              error instanceof Error
                ? error.message
                : "Senden an GetHyped ist fehlgeschlagen.",
            rejectedItems: [],
            skippedItems: [],
          },
        })
      );
    } finally {
      setIngesting(false);
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
            Dieser Scraper existiert nicht (mehr).
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

  const busy = loading || following || updating || ingesting;
  const followUp = scraper.followUp
    ? followUpProgressOf(
        scraper.followUp.groups,
        scraper.preview,
        following || updating || scraper.followUp.running
      )
    : null;

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
            {loading || (updating && searchProgress && !following) ? (
              <div className="mt-3 max-w-md">
                <SearchStatus
                  progress={searchProgress ?? makeSearchProgress("search", 0, null)}
                />
              </div>
            ) : (
              <p className="mt-1 text-sm text-black/60">
                {updating
                  ? "Einträge werden aktualisiert …"
                  : following && followUp
                    ? `${followUp.done} / ${followUp.total} Unterseiten geladen.`
                    : followUp && canResumeFollowUp(followUp.groups)
                      ? `${followUp.done} / ${followUp.total} Unterseiten angehalten. Mit Weiter fortsetzen.`
                      : scraper.preview.length === 0
                        ? "Mit Scrapen die Suchseite inkl. aller Seiten laden."
                        : "Danach Unterseiten Scrapen oder Update für einen Abgleich."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRerun}
              disabled={busy}
              className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition enabled:hover:bg-black/85 disabled:opacity-50"
            >
              {loading ? `${searchProgress?.percent ?? 0} %` : "Scrapen"}
            </button>
            {following || updating ? (
              <button
                type="button"
                onClick={handleStopFollowUps}
                className="rounded-full border border-black/15 px-5 py-3 text-sm font-semibold text-black transition hover:bg-black/5"
              >
                Anhalten
                {followUp ? ` ${followUp.done}/${followUp.total}` : ""}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFollowUps}
                disabled={busy || scraper.preview.length === 0}
                className="rounded-full border border-black/15 px-5 py-3 text-sm font-semibold text-black transition enabled:hover:bg-black/5 disabled:opacity-50"
              >
                {followUp && canResumeFollowUp(followUp.groups)
                  ? "Weiter"
                  : "Unterseiten Scrapen"}
              </button>
            )}
            <button
              type="button"
              onClick={handleUpdate}
              disabled={busy || scraper.preview.length === 0}
              className="rounded-full border border-black/15 px-5 py-3 text-sm font-semibold text-black transition enabled:hover:bg-black/5 disabled:opacity-50"
            >
              {updating ? "Update …" : "Update"}
            </button>
            <button
              type="button"
              onClick={handleIngest}
              disabled={busy || scraper.preview.length === 0}
              className="rounded-full border border-black/15 px-5 py-3 text-sm font-semibold text-black transition enabled:hover:bg-black/5 disabled:opacity-50"
            >
              {ingesting ? "Senden …" : "An GetHyped senden"}
            </button>
          </div>
        </div>
        <GethypedTokenField className="mt-3" />
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6">
        {scraper.error && !busy ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {scraper.error}
          </p>
        ) : null}
        {scraper.warning && !busy ? (
          <p className="rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-sm text-black/60">
            {scraper.warning}
          </p>
        ) : null}

        {scraper.lastUpdate ? <UpdateStatus update={scraper.lastUpdate} /> : null}
        {scraper.lastIngest ? <IngestStatus ingest={scraper.lastIngest} /> : null}

        {followUp ? (
          <FollowUpStatus
            progress={followUp}
            onStop={following || updating ? handleStopFollowUps : undefined}
          />
        ) : null}

        {scraper.preview.length === 0 ? (
          <p className="text-sm text-black/50">
            {loading
              ? "Einträge der Suchseite werden gelesen …"
              : following || updating
                ? "Einträge werden gelesen …"
                : "Noch keine Preview. Starte mit Scrapen."}
          </p>
        ) : (
          <ScraperPreview
            preview={scraper.preview}
            groups={followUp?.groups}
          />
        )}
      </section>
    </main>
  );
}
