import type { EventimEvent } from "@/lib/eventim";

export type EventDataRow = {
  label: string;
  value: string;
  image?: boolean;
};

export function formatEventDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function formatEventDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(parsed);
}

export function eventDataRows(event: EventimEvent): EventDataRow[] {
  const rows: EventDataRow[] = [];
  const add = (label: string, value: string | null | undefined, image = false) => {
    if (!value) return;
    rows.push({ label, value, image });
  };

  add("Name", event.name);
  add("Datum", formatEventDay(event.date) ?? event.date);
  add("Ort", event.location);
  add("Venue", event.venue);
  add("Stadt", event.city);
  add("Städte", event.cities?.join(", "));
  add("Herobild", event.heroImage, true);
  add("Bild", event.image && event.image !== event.heroImage ? event.image : null, true);
  add("URL", event.url);
  add("Folgeseite", event.tourUrl && event.tourUrl !== event.url ? event.tourUrl : null);
  add("Product Group", event.productGroupId);
  for (const [label, value] of Object.entries(event.extras ?? {})) {
    add(label, value);
  }
  return rows;
}
