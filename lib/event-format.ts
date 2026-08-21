import type { EventimEvent } from "@/lib/eventim";

export type EventDataRow = {
  label: string;
  value: string;
  image?: boolean;
  link?: boolean;
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
  const add = (
    label: string,
    value: string | null | undefined,
    kind: "text" | "image" | "link" = "text"
  ) => {
    if (!value) return;
    rows.push({
      label,
      value,
      image: kind === "image",
      link: kind === "link",
    });
  };

  add("Stadt", event.city);
  add("Datum", formatEventDay(event.date) ?? event.date);
  add("Ort", event.location ?? event.venue);
  add("Event-Herobild", event.heroImage ?? event.image, "image");
  add("Ticketlink", event.ticketUrl ?? event.url, "link");
  return rows;
}
