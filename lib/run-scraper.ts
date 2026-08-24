import {
  isEventimUrl,
  scrapeEventim,
  scrapeEventimFollowUpGroup,
  scrapeEventimFollowUps,
} from "@/lib/eventim-scraper";
import {
  eventsForGroup,
  followUpProgressOf,
  listFollowUpGroups,
  replaceGroupEvents,
  type FollowUpGroup,
  type FollowUpProgress,
} from "@/lib/follow-up";
import type { ScrapedEvent } from "@/lib/scraped-event";
import {
  applySelection,
  getScraper,
  selectionForRerun,
  updateScraper,
  type Scraper,
  type ScraperSelection,
} from "@/lib/scrapers";

export type { FollowUpProgress } from "@/lib/follow-up";

type RunPayload = {
  events: ScrapedEvent[];
  warning: string | null;
  error: string | null;
};

const FOLLOW_UP_CONCURRENCY = 3;

export async function loadScraperPreview(scraper: Scraper): Promise<Scraper | null> {
  const result = await scrapeWithFallback(scraper.url);
  const firstLoad = scraper.preview.length === 0;
  return updateScraper(scraper.id, {
    preview: result.events,
    ...(firstLoad ? { events: [], entryCount: 0 } : {}),
    lastRunAt: new Date().toISOString(),
    error: result.events.length > 0 ? null : result.error,
    warning: result.warning,
    followUp: null,
  });
}

export async function runScraper(scraper: Scraper): Promise<Scraper | null> {
  const result = await scrapeWithFallback(scraper.url);
  const selection = selectionForRerun(scraper.selection);
  const events = applySelection(result.events, selection);
  return updateScraper(scraper.id, {
    preview: result.events,
    selection,
    events,
    entryCount: events.length,
    lastRunAt: new Date().toISOString(),
    error: result.events.length > 0 ? null : result.error,
    warning: result.warning,
    followUp: null,
  });
}

export async function scrapeScraperFollowUps(
  scraper: Scraper,
  onProgress?: (progress: FollowUpProgress, next: Scraper) => void
): Promise<Scraper | null> {
  const source =
    scraper.preview.length > 0 ? scraper.preview : scraper.events;

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
    const selected = applySelection(events, selection);
    return updateScraper(scraper.id, {
      preview: events,
      selection,
      events: selected,
      entryCount: selected.length,
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
    });
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

  if (typeof window !== "undefined" && isEventimUrl(scraper.url)) {
    try {
      const result = await scrapeEventimFollowUps(
        source,
        scraper.url,
        (progress, events) => {
          emit(progress, events, null, null);
        }
      );
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
        emit
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
      const server = await followUpsViaGroups(scraper.url, source, emit);
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

  const server = await followUpsViaGroups(scraper.url, source, emit);
  return persist(
    server.events,
    server.groups,
    false,
    server.warning,
    server.error
  );
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

async function scrapeWithFallback(url: string): Promise<RunPayload> {
  if (typeof window !== "undefined" && isEventimUrl(url)) {
    try {
      const result = await scrapeEventim(url);
      if (result.events.length > 0) {
        return { ...result, error: null };
      }
      const server = await scrapeViaApi(url);
      if (server.events.length > 0) return server;
      return {
        events: [],
        warning: server.warning ?? result.warning,
        error: server.error,
      };
    } catch (error) {
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
  ) => Scraper | null
): Promise<
  RunPayload & {
    groups: FollowUpGroup[];
  }
> {
  let groups = listFollowUpGroups(events);
  let current = events;
  if (groups.length === 0) {
    const all = await scrapeViaApi(url, { followUps: true, events });
    return { ...all, groups };
  }

  emit(followUpProgressOf(groups, current, true), current, null, null);

  const limit = createLimiter(FOLLOW_UP_CONCURRENCY);
  await Promise.all(
    groups.map((group) =>
      limit(async () => {
        groups = groups.map((item) =>
          item.id === group.id ? { ...item, status: "running" } : item
        );
        emit(followUpProgressOf(groups, current, true), current, null, null);
        const originals = eventsForGroup(events, group.id);
        try {
          const result = await scrapeGroupWithFallback(url, originals, group.id);
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
                  status: "done",
                  eventCount:
                    result.events.length > 0
                      ? result.events.length
                      : originals.length,
                  error: null,
                }
              : item
          );
        } catch (error) {
          groups = groups.map((item) =>
            item.id === group.id
              ? {
                  ...item,
                  status: "error",
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

  const failed = groups.filter((group) => group.status === "error").length;
  return {
    events: current,
    groups,
    warning:
      failed > 0
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
