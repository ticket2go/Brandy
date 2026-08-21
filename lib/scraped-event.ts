export type ScrapedEvent = {
  name: string;
  venue: string | null;
  city: string | null;
  location: string | null;
  date: string | null;
  time: string | null;
  startsAt: string | null;
  heroImage: string | null;
  ticketUrl: string | null;
  price: string | null;
};

const BERLIN = "Europe/Berlin";

export function formatDate(iso: string | null): string | null {
  const parsed = toDate(iso);
  if (!parsed) return null;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function formatTime(iso: string | null): string | null {
  const parsed = toDate(iso);
  if (!parsed) return null;
  if (!/\d{2}:\d{2}/.test(iso ?? "")) return null;
  return `${new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed)} Uhr`;
}

export function formatPrice(
  from: number | null,
  to: number | null,
  currency: string | null
): string | null {
  if (from == null && to == null) return null;
  const code = currency ?? "EUR";
  const money = (value: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  if (from != null && to != null && from !== to) {
    return `${money(from)} – ${money(to)}`;
  }
  const single = from ?? to;
  return single == null ? null : `ab ${money(single)}`;
}

export function combineLocation(
  venue: string | null,
  city: string | null
): string | null {
  if (venue && city && venue.toLowerCase() !== city.toLowerCase()) {
    return `${venue}, ${city}`;
  }
  return venue ?? city;
}

export function eventKey(event: ScrapedEvent): string {
  return [
    event.ticketUrl ?? "",
    event.name,
    event.startsAt ?? "",
    event.city ?? "",
    event.venue ?? "",
  ]
    .join("|")
    .toLowerCase();
}

export function dedupeEvents(events: ScrapedEvent[]): ScrapedEvent[] {
  const seen = new Set<string>();
  const out: ScrapedEvent[] = [];
  for (const event of events) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

export function sortEvents(events: ScrapedEvent[]): ScrapedEvent[] {
  return [...events].sort((a, b) => {
    const left = a.startsAt ?? "";
    const right = b.startsAt ?? "";
    if (left && right) return left.localeCompare(right);
    if (left) return -1;
    if (right) return 1;
    return a.name.localeCompare(b.name, "de");
  });
}

function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
