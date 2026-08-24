import {
  dedupeEvents,
  sortEvents,
  type ScrapedEvent,
} from "@/lib/scraped-event";

export type FollowUpStatus = "pending" | "running" | "done" | "error";

export type FollowUpGroup = {
  id: string;
  title: string;
  status: FollowUpStatus;
  listingCount: number;
  eventCount: number;
  error: string | null;
};

export type FollowUpProgress = {
  groups: FollowUpGroup[];
  done: number;
  total: number;
  eventCount: number;
  running: boolean;
};

export function followUpGroupId(event: ScrapedEvent): string | null {
  if (typeof event.productGroupId === "string" && event.productGroupId) {
    return event.productGroupId;
  }
  return productGroupIdFromLink(event.ticketUrl ?? "");
}

export function listFollowUpGroups(events: ScrapedEvent[]): FollowUpGroup[] {
  const grouped = new Map<string, ScrapedEvent[]>();
  for (const event of events) {
    const id = followUpGroupId(event);
    if (!id) continue;
    const bucket = grouped.get(id) ?? [];
    bucket.push(event);
    grouped.set(id, bucket);
  }
  return [...grouped.entries()].map(([id, items]) => ({
    id,
    title: items[0]?.name || id,
    status: "pending",
    listingCount: items.length,
    eventCount: items.length,
    error: null,
  }));
}

export function replaceGroupEvents(
  events: ScrapedEvent[],
  groupId: string,
  next: ScrapedEvent[]
): ScrapedEvent[] {
  const kept = events.filter((event) => followUpGroupId(event) !== groupId);
  return sortEvents(dedupeEvents([...kept, ...next]));
}

export function eventsForGroup(
  events: ScrapedEvent[],
  groupId: string
): ScrapedEvent[] {
  return events.filter((event) => followUpGroupId(event) === groupId);
}

export function ungroupedEvents(events: ScrapedEvent[]): ScrapedEvent[] {
  return events.filter((event) => !followUpGroupId(event));
}

export function followUpProgressOf(
  groups: FollowUpGroup[],
  events: ScrapedEvent[],
  running: boolean
): FollowUpProgress {
  const finished = groups.filter(
    (group) => group.status === "done" || group.status === "error"
  ).length;
  return {
    groups,
    done: finished,
    total: groups.length,
    eventCount: events.length,
    running,
  };
}

export function isFollowUpGroup(value: unknown): value is FollowUpGroup {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    (row.status === "pending" ||
      row.status === "running" ||
      row.status === "done" ||
      row.status === "error") &&
    typeof row.listingCount === "number" &&
    typeof row.eventCount === "number"
  );
}

function productGroupIdFromLink(link: string): string | null {
  try {
    const segments = new URL(link).pathname.split("/").filter(Boolean);
    const type = segments[0]?.toLowerCase();
    if (type === "eventseries") {
      return segments[1]?.match(/^\d{4,}$/)?.[0] ?? null;
    }
    if (type === "artist" || type === "attraction") {
      const last = segments[segments.length - 1] ?? "";
      return last.match(/-(\d{4,})$/)?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
