"use client";

import { FollowUpBadge, sectionId } from "@/components/FollowUpStatus";
import {
  eventsForGroup,
  ungroupedEvents,
  type FollowUpGroup,
} from "@/lib/follow-up";
import type { ScrapedEvent } from "@/lib/scraped-event";

type ScraperPreviewProps = {
  preview: ScrapedEvent[];
  groups?: FollowUpGroup[] | null;
};

export default function ScraperPreview({
  preview,
  groups,
}: ScraperPreviewProps) {
  const rest = groups && groups.length > 0 ? ungroupedEvents(preview) : [];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-black/55">
        {preview.length === 1 ? "1 Eintrag" : `${preview.length} Einträge`}
      </p>

      {groups && groups.length > 0 ? (
        <div className="flex flex-col gap-8">
          {groups.map((group) => {
            const items = eventsForGroup(preview, group.id);
            return (
              <section
                key={group.id}
                id={sectionId(group.id)}
                className="scroll-mt-6 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <FollowUpBadge group={group} />
                  <p className="text-xs text-black/40">
                    {group.status === "running"
                      ? "wird geladen …"
                      : group.status === "pending"
                        ? "wartet"
                        : group.status === "paused"
                          ? "angehalten"
                          : group.status === "error"
                            ? group.error ?? "Fehler"
                            : items.length === 1
                              ? "1 Termin"
                              : `${items.length} Termine`}
                  </p>
                </div>
                {items.length > 0 ? (
                  <EventList events={items} />
                ) : (
                  <p className="text-sm text-black/40">Noch keine Einträge.</p>
                )}
              </section>
            );
          })}
          {rest.length > 0 ? (
            <section className="flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-widest text-black/40">
                Weitere Einträge
              </p>
              <EventList events={rest} />
            </section>
          ) : null}
        </div>
      ) : (
        <EventList events={preview} />
      )}
    </div>
  );
}

function EventList({ events }: { events: ScrapedEvent[] }) {
  return (
    <ul className="divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/10">
      {events.map((event, index) => (
        <li
          key={`${event.ticketUrl ?? event.name}-${event.startsAt ?? index}`}
        >
          <article className="flex gap-4 bg-white p-4">
            {event.heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.heroImage}
                alt=""
                referrerPolicy="no-referrer"
                className="h-16 w-28 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded-xl bg-black/5 text-[10px] text-black/30">
                Bild
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-black">{event.name}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-black/60">
                <span>{event.location ?? "Ort fehlt"}</span>
                <span>{event.date ?? "Datum fehlt"}</span>
                <span>{event.time ?? "Uhrzeit fehlt"}</span>
                <span>{event.price ?? "Preis fehlt"}</span>
              </div>
              {event.ticketUrl ? (
                <a
                  href={event.ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block max-w-full truncate text-[12px] text-black/40 underline decoration-black/20 hover:decoration-black"
                >
                  {event.ticketUrl}
                </a>
              ) : (
                <p className="mt-1 text-[12px] text-black/40">Ticketlink fehlt</p>
              )}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
