import {
  isEventimUrl,
  scrapeEventim,
  scrapeEventimFollowUpGroup,
  scrapeEventimFollowUps,
} from "@/lib/eventim-scraper";
import { makeSearchProgress, type SearchProgress } from "@/lib/search-progress";
import {
  canResumeFollowUp,
  eventsForGroup,
  followUpProgressOf,
  listFollowUpGroups,
  pauseFollowUpGroups,
  replaceGroupEvents,
  type FollowUpGroup,
  type FollowUpProgress,
} from "@/lib/follow-up";
import { diffEvents } from "@/lib/event-diff";
import type { ScrapedEvent } from "@/lib/scraped-event";
import {
  applySelection,
  flushScrapers,
  getScraper,
  selectionForRerun,
  updateScraper,
  type Scraper,
  type ScraperSelection,
} from "@/lib/scrapers";

export type { FollowUpProgress } from "@/lib/follow-up";
export type { ScraperUpdate } from "@/lib/event-diff";
export type { SearchProgress } from "@/lib/search-progress";

type RunPayload = {
  events: ScrapedEvent[];
  warning: string | null;
  error: string | null;
};

const FOLLOW_UP_CONCURRENCY = 3;

type SearchListener = (
  progress: SearchProgress,
  events?: ScrapedEvent[]
) => void;

export async function loadScraperPreview(
  scraper: Scraper,
  onSearchProgress?: SearchListener
): Promise<Scraper | null> {
  const result = await scrapeWithFallback(scraper.url, (progress, events) => {
    onSearchProgress?.(progress, events);
    if (progress.phase === "search" && progress.percent >= 100) {
      persistSearchPreview(scraper.id, events);
    }
  });
  const firstLoad = scraper.preview.length === 0;
  const next = updateScraper(
    scraper.id,
    {
      preview: result.events,
      ...(firstLoad ? { events: [], entryCount: 0 } : {}),
      lastRunAt: new Date().toISOString(),
      error: result.events.length > 0 ? null : result.error,
      warning: result.warning,
      followUp: null,
    },
    { persistEvents: result.events.length > 0 }
  );
  await flushScrapers();
  return next;
}

export async function runScraper(
  scraper: Scraper,
  onSearchProgress?: SearchListener
): Promise<Scraper | null> {
  const result = await scrapeWithFallback(scraper.url, (progress, events) => {
    onSearchProgress?.(progress, events);
    if (progress.phase === "search" && progress.percent >= 100) {
      persistSearchPreview(scraper.id, events);
    }
  });
  const selection = selectionForRerun(scraper.selection);
  const events = applySelection(result.events, selection);
  const next = updateScraper(
    scraper.id,
    {
      preview: result.events,
      selection,
      events,
      entryCount: events.length,
      lastRunAt: new Date().toISOString(),
      error: result.events.length > 0 ? null : result.error,
      warning: result.warning,
      followUp: null,
    },
    { persistEvents: result.events.length > 0 }
  );
  await flushScrapers();
  return next;
}

export async function updateScraperEntries(
  scraper: Scraper,
  onProgress?: (progress: FollowUpProgress, next: Scraper) => void,
  signal?: AbortSignal,
  onSearchProgress?: SearchListener
): Promise<Scraper | null> {
  const previous =
    scraper.preview.length > 0 ? scraper.preview : scraper.events;
  const search = await scrapeWithFallback(scraper.url, (progress, events) => {
    onSearchProgress?.(progress, events);
    if (progress.phase === "search" && progress.percent >= 100) {
      persistSearchPreview(scraper.id, events);
    }
  });
  if (search.events.length === 0) {
    const failed = updateScraper(scraper.id, {
      lastRunAt: new Date().toISOString(),
      error: search.error ?? "Beim Update wurden keine Einträge gefunden.",
      warning: search.warning,
    });
    await flushScrapers();
    return failed;
  }

  const expand = Boolean(
    scraper.followUp?.groups.some(
      (group) => group.status === "done" || group.status === "paused"
    )
  );

  let nextEvents = search.events;

  if (expand) {
    const expanded = await scrapeScraperFollowUps(
      {
        ...scraper,
        preview: search.events,
        followUp: null,
      },
      onProgress,
      signal
    );
    if (expanded) {
      nextEvents = expanded.preview;
      const stats = diffEvents(previous, nextEvents);
      const saved = updateScraper(
        expanded.id,
        {
          preview: nextEvents,
          events: nextEvents,
          entryCount: nextEvents.length,
          lastRunAt: new Date().toISOString(),
          error: null,
          warning: expanded.warning,
          lastUpdate: stats,
          followUp: expanded.followUp
            ? { ...expanded.followUp, running: false }
            : null,
        },
        { persistEvents: true }
      );
      await flushScrapers();
      return saved;
    }
  }

  const stats = diffEvents(previous, nextEvents);
  const saved = updateScraper(
    scraper.id,
    {
      preview: nextEvents,
      events: nextEvents,
      entryCount: nextEvents.length,
      lastRunAt: new Date().toISOString(),
      error: null,
      warning: search.warning,
      followUp: expand ? scraper.followUp : null,
      lastUpdate: stats,
    },
    { persistEvents: true }
  );
  await flushScrapers();
  return saved;
}

export async function scrapeScraperFollowUps(
  scraper: Scraper,
  onProgress?: (progress: FollowUpProgress, next: Scraper) => void,
  signal?: AbortSignal
): Promise<Scraper | null> {
  const source =
    scraper.preview.length > 0 ? scraper.preview : scraper.events;
  const resumeGroups =
    scraper.followUp?.groups && canResumeFollowUp(scraper.followUp.groups)
      ? scraper.followUp.groups
      : undefined;

  const persist = (
    events: ScrapedEvent[],
    groups: FollowUpGroup[],
    running: boolean,
    warning: string | null,
    error: string | null
  ) => {
    const selection = {
      ...scraper.selection,
      selectAll: true,
      itemIds: [],
    };
    const selected = running ? [] : applySelection(events, selection);
    const previous = getScraper(scraper.id);
    const grew = events.length !== (previous?.preview.length ?? 0);
    try {
      return updateScraper(
        scraper.id,
        {
          preview: events,
          selection,
          ...(running
            ? { entryCount: events.length }
            : { events: selected, entryCount: selected.length }),
          lastRunAt: new Date().toISOString(),
          error: events.length > 0 ? null : error,
          warning,
          followUp:
            groups.length > 0
              ? {
                  running,
                  groups,
                }
              : null,
        },
        { persistEvents: !running || grew }
      );
    } catch {
      return {
        ...scraper,
        preview: events,
        selection,
        events: running ? scraper.events : selected,
        entryCount: events.length,
        lastRunAt: new Date().toISOString(),
        error: events.length > 0 ? null : error,
        warning,
        followUp:
          groups.length > 0
            ? {
                running,
                groups,
              }
            : null,
      };
    }
  };

  const emit = (
    progress: FollowUpProgress,
    events: ScrapedEvent[],
    warning: string | null,
    error: string | null
  ) => {
    const next = persist(
      events,
      progress.groups,
      progress.running,
      warning,
      error
    );
    if (next) onProgress?.(progress, next);
    return next;
  };

  try {
    if (typeof window !== "undefined" && isEventimUrl(scraper.url)) {
    try {
      const result = await scrapeEventimFollowUps(source, scraper.url, {
        signal,
        groups: resumeGroups,
        onProgress: (progress, events) => {
          try {
            emit(progress, events, null, null);
          } catch {
            onProgress?.(progress, {
              ...scraper,
              preview: events,
              followUp: {
                running: progress.running,
                groups: progress.groups,
              },
              entryCount: events.length,
            });
          }
        },
      });
      if (signal?.aborted) {
        const latest = getScraper(scraper.id);
        const groups = pauseFollowUpGroups(
          latest?.followUp?.groups ?? resumeGroups ?? listFollowUpGroups(source)
        );
        return persist(
          result.events.length > 0 ? result.events : source,
          groups,
          false,
          result.warning ?? "Unterseiten-Scraping wurde angehalten.",
          null
        );
      }
      if (result.events.length > 0) {
        const groups =
          getScraper(scraper.id)?.followUp?.groups ??
          listFollowUpGroups(result.events).map((group) => ({
            ...group,
            status: "done" as const,
          }));
        return persist(result.events, groups, false, result.warning, null);
      }
      const server = await followUpsViaGroups(
        scraper.url,
        source,
        emit,
        signal,
        resumeGroups
      );
      if (server.events.length > 0) {
        return persist(
          server.events,
          server.groups,
          false,
          server.warning,
          server.error
        );
      }
      return persist(
        [],
        listFollowUpGroups(source),
        false,
        server.warning ?? result.warning,
        server.error
      );
    } catch (error) {
      if (signal?.aborted) {
        const latest = getScraper(scraper.id);
        return persist(
          latest?.preview?.length ? latest.preview : source,
          pauseFollowUpGroups(
            latest?.followUp?.groups ?? resumeGroups ?? listFollowUpGroups(source)
          ),
          false,
          "Unterseiten-Scraping wurde angehalten.",
          null
        );
      }
      const server = await followUpsViaGroups(
        scraper.url,
        source,
        emit,
        signal,
        resumeGroups
      );
      if (server.events.length > 0) {
        return persist(
          server.events,
          server.groups,
          false,
          server.warning,
          server.error
        );
      }
      return persist(
        [],
        listFollowUpGroups(source),
        false,
        server.warning,
        server.error ??
          (error instanceof Error ? error.message : "Scraping fehlgeschlagen.")
      );
    }
  }

  const server = await followUpsViaGroups(
    scraper.url,
    source,
    emit,
    signal,
    resumeGroups
  );
  return persist(
    server.events,
    server.groups,
    false,
    server.warning,
    server.error
  );
  } finally {
    await flushScrapers();
  }
}

export function applyScraperSelection(
  scraper: Scraper,
  selection: ScraperSelection
): Scraper | null {
  const events = applySelection(scraper.preview, selection);
  return updateScraper(scraper.id, {
    selection,
    events,
    entryCount: events.length,
    error:
      scraper.preview.length === 0
        ? scraper.error
        : events.length > 0
          ? null
          : "Bitte mindestens ein Event anklicken.",
  });
}

function persistSearchPreview(id: string, events?: ScrapedEvent[]) {
  if (!events || events.length === 0) return;
  try {
    updateScraper(
      id,
      {
        preview: events,
        entryCount: events.length,
      },
      { persistEvents: true }
    );
  } catch {
    // Zwischenstand ist optional, der Lauf geht weiter.
  }
}

async function scrapeWithFallback(
  url: string,
  onSearchProgress?: SearchListener
): Promise<RunPayload> {
  onSearchProgress?.(makeSearchProgress("search", 0, null));
  if (typeof window !== "undefined" && isEventimUrl(url)) {
    try {
      const result = await scrapeEventim(url, { onProgress: onSearchProgress });
      if (result.events.length > 0) {
        return { ...result, error: null };
      }
      onSearchProgress?.(makeSearchProgress("search", 0, null));
      const server = await scrapeViaApi(url);
      if (server.events.length > 0) return server;
      return {
        events: [],
        warning: server.warning ?? result.warning,
        error: server.error,
      };
    } catch (error) {
      onSearchProgress?.(makeSearchProgress("search", 0, null));
      const server = await scrapeViaApi(url);
      if (server.events.length > 0) return server;
      if (server.error || server.warning) return server;
      return {
        events: [],
        warning: null,
        error:
          error instanceof Error ? error.message : "Scraping fehlgeschlagen.",
      };
    }
  }

  return scrapeViaApi(url);
}

async function followUpsViaGroups(
  url: string,
  events: ScrapedEvent[],
  emit: (
    progress: FollowUpProgress,
    events: ScrapedEvent[],
    warning: string | null,
    error: string | null
  ) => Scraper | null,
  signal?: AbortSignal,
  existing?: FollowUpGroup[]
): Promise<
  RunPayload & {
    groups: FollowUpGroup[];
  }
> {
  let groups =
    existing && existing.length > 0
      ? existing.map((group) =>
          group.status === "paused" || group.status === "error"
            ? { ...group, status: "pending" as const }
            : group
        )
      : listFollowUpGroups(events);
  let current = events;
  const pending = groups.filter((group) => group.status !== "done");
  if (pending.length === 0) {
    const all = await scrapeViaApi(url, { followUps: true, events });
    return { ...all, groups };
  }

  emit(followUpProgressOf(groups, current, true), current, null, null);

  const limit = createLimiter(FOLLOW_UP_CONCURRENCY);
  await Promise.all(
    pending.map((group) =>
      limit(async () => {
        if (signal?.aborted) {
          groups = groups.map((item) =>
            item.id === group.id && item.status === "pending"
              ? { ...item, status: "paused" as const }
              : item
          );
          return;
        }
        groups = groups.map((item) =>
          item.id === group.id ? { ...item, status: "running" as const } : item
        );
        emit(followUpProgressOf(groups, current, true), current, null, null);
        const originals = eventsForGroup(events, group.id);
        try {
          const result = await scrapeGroupWithFallback(url, originals, group.id);
          if (signal?.aborted) {
            groups = groups.map((item) =>
              item.id === group.id ? { ...item, status: "paused" as const } : item
            );
            return;
          }
          if (result.events.length === 0 && result.error) {
            throw new Error(result.error);
          }
          current = replaceGroupEvents(
            current,
            group.id,
            result.events.length > 0 ? result.events : originals
          );
          groups = groups.map((item) =>
            item.id === group.id
              ? {
                  ...item,
                  status: "done" as const,
                  eventCount:
                    result.events.length > 0
                      ? result.events.length
                      : originals.length,
                  error: null,
                }
              : item
          );
        } catch (error) {
          if (signal?.aborted) {
            groups = groups.map((item) =>
              item.id === group.id ? { ...item, status: "paused" as const } : item
            );
            return;
          }
          groups = groups.map((item) =>
            item.id === group.id
              ? {
                  ...item,
                  status: "error" as const,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Unterseite konnte nicht geladen werden.",
                }
              : item
          );
        }
        emit(followUpProgressOf(groups, current, true), current, null, null);
      })
    )
  );

  const stopped = Boolean(signal?.aborted);
  if (stopped) groups = pauseFollowUpGroups(groups);
  const failed = groups.filter((group) => group.status === "error").length;
  return {
    events: current,
    groups,
    warning: stopped
      ? "Unterseiten-Scraping wurde angehalten."
      : failed > 0
        ? `${failed} Unterseite${failed === 1 ? "" : "n"} konnten nicht geladen werden.`
        : null,
    error: current.length > 0 ? null : "Scraping fehlgeschlagen.",
  };
}

async function scrapeGroupWithFallback(
  url: string,
  events: ScrapedEvent[],
  groupId: string
): Promise<RunPayload> {
  if (typeof window !== "undefined" && isEventimUrl(url)) {
    try {
      const result = await scrapeEventimFollowUpGroup(events, url, groupId);
      if (result.events.length > 0) {
        return { ...result, error: null };
      }
    } catch {
      // Server-Fallback für diese Gruppe.
    }
  }
  return scrapeViaApi(url, { followUps: true, events, groupId });
}

async function scrapeViaApi(
  url: string,
  extra?: { followUps?: boolean; events?: ScrapedEvent[]; groupId?: string }
): Promise<RunPayload> {
  try {
    const response = await fetch("/api/scraper/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        followUps: extra?.followUps ?? false,
        events: extra?.events ?? [],
        groupId: extra?.groupId,
      }),
    });
    const payload = (await response.json()) as {
      events?: ScrapedEvent[];
      warning?: string | null;
      error?: string | null;
    };
    return {
      events: payload.events ?? [],
      warning: payload.warning ?? null,
      error: payload.error ?? null,
    };
  } catch (err) {
    return {
      events: [],
      warning: null,
      error: err instanceof Error ? err.message : "Scraping fehlgeschlagen.",
    };
  }
}

function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < max) {
        active += 1;
        resolve();
        return;
      }
      waiting.push(() => {
        active += 1;
        resolve();
      });
    });
  const release = () => {
    active = Math.max(0, active - 1);
    const next = waiting.shift();
    if (next) next();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
