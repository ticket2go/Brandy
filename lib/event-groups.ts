import {
  artistPageUrlFromEventimUrl,
  artistSlugFromUrl,
  uniqueCities,
} from "@/lib/eventim-detail";
import { productGroupIdFromUrl, type EventimEvent } from "@/lib/eventim";
import { slugify } from "@/lib/slugify";

export type EventGroup = {
  key: string;
  name: string;
  heroImage: string | null;
  image: string | null;
  cities: string[];
  dates: EventimEvent[];
  tourUrl: string | null;
};

export function eventGroupKey(event: EventimEvent): string {
  if (event.groupKey) return event.groupKey;
  const slug = artistSlugFromUrl(event.tourUrl ?? event.url ?? "");
  if (slug) return `artist-${slug}`;
  const groupId =
    event.productGroupId ??
    productGroupIdFromUrl(event.tourUrl ?? event.url ?? "");
  if (groupId) return groupId;
  const seed = normalizeKeyUrl(event.tourUrl ?? event.url) ?? event.name;
  return `${slugify(event.name)}-${shortHash(seed)}`;
}

export function groupEvents(events: EventimEvent[]): EventGroup[] {
  const map = new Map<string, EventimEvent[]>();
  for (const event of events) {
    const key = eventGroupKey(event);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }

  return Array.from(map.entries()).map(([key, dates]) => {
    const first = dates[0];
    return {
      key,
      name: first?.name ?? "Event",
      heroImage:
        dates.find((item) => item.heroImage)?.heroImage ??
        dates.find((item) => item.image)?.image ??
        null,
      image: first?.image ?? first?.heroImage ?? null,
      cities: uniqueCities(
        dates.flatMap((item) => item.cities ?? []),
        dates.map((item) => item.city)
      ),
      dates,
      tourUrl:
        artistPageUrlFromEventimUrl(
          dates.find((item) => item.tourUrl)?.tourUrl ??
            dates.find((item) => item.url)?.url ??
            ""
        ) ??
        dates.find((item) => item.tourUrl)?.tourUrl ??
        dates.find((item) => item.url)?.url ??
        null,
    };
  });
}

export function findEventGroup(
  events: EventimEvent[],
  eventId: string
): EventGroup | null {
  return groupEvents(events).find((group) => group.key === eventId) ?? null;
}

export function withTourUrl(
  events: EventimEvent[],
  tourUrl: string | null,
  productGroupId?: string | null,
  groupKey?: string | null
): EventimEvent[] {
  const followUp = tourUrl ? artistPageUrlFromEventimUrl(tourUrl) ?? tourUrl : null;
  return events.map((event) => ({
    ...event,
    tourUrl: followUp ?? event.tourUrl ?? tourUrl,
    productGroupId: event.productGroupId ?? productGroupId ?? null,
    groupKey: groupKey ?? event.groupKey ?? null,
  }));
}

export function followUpUrlFromGroup(group: EventGroup): string | null {
  return (
    artistPageUrlFromEventimUrl(group.tourUrl ?? group.dates[0]?.url ?? "") ??
    group.tourUrl ??
    group.dates[0]?.url ??
    null
  );
}

function normalizeKeyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function shortHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
