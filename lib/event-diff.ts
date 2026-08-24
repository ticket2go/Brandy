import { eventKey, type ScrapedEvent } from "@/lib/scraped-event";

export type ScraperUpdate = {
  at: string;
  updated: number;
  added: number;
  removed: number;
  unchanged: number;
};

export function diffEvents(
  previous: ScrapedEvent[],
  next: ScrapedEvent[]
): ScraperUpdate {
  const before = new Map(previous.map((event) => [eventKey(event), event]));
  const after = new Map(next.map((event) => [eventKey(event), event]));
  let updated = 0;
  let unchanged = 0;
  let added = 0;
  let removed = 0;

  for (const [key, event] of after) {
    const older = before.get(key);
    if (!older) {
      added += 1;
      continue;
    }
    if (samePayload(older, event)) unchanged += 1;
    else updated += 1;
  }
  for (const key of before.keys()) {
    if (!after.has(key)) removed += 1;
  }

  return {
    at: new Date().toISOString(),
    updated,
    added,
    removed,
    unchanged,
  };
}

function samePayload(left: ScrapedEvent, right: ScrapedEvent): boolean {
  return (
    left.name === right.name &&
    left.location === right.location &&
    left.date === right.date &&
    left.time === right.time &&
    left.price === right.price &&
    left.heroImage === right.heroImage &&
    left.ticketUrl === right.ticketUrl
  );
}
