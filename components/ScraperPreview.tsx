"use client";

import type { ReactNode } from "react";

import {
  eventKey,
  FIELD_LABELS,
  SCRAPER_FIELDS,
  type ScrapedEvent,
  type ScraperField,
} from "@/lib/scraped-event";
import type { ScraperSelection } from "@/lib/scrapers";

type ScraperPreviewProps = {
  preview: ScrapedEvent[];
  selection: ScraperSelection;
  onChange: (selection: ScraperSelection) => void;
};

export default function ScraperPreview({
  preview,
  selection,
  onChange,
}: ScraperPreviewProps) {
  const selectedIds = new Set(selection.itemIds);
  const selectedCount = selection.selectAll ? preview.length : selectedIds.size;
  const allSelected = preview.length > 0 && selectedCount === preview.length;

  const toggleAll = () => {
    onChange({
      ...selection,
      selectAll: !allSelected,
      itemIds: !allSelected ? preview.map((event) => eventKey(event)) : [],
    });
  };

  const toggleItem = (id: string) => {
    if (selection.selectAll) {
      onChange({
        ...selection,
        selectAll: false,
        itemIds: preview.map((event) => eventKey(event)).filter((key) => key !== id),
      });
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({
      ...selection,
      selectAll: next.size === preview.length && preview.length > 0,
      itemIds: [...next],
    });
  };

  const toggleField = (field: ScraperField) => {
    const has = selection.fields.includes(field);
    const fields = has
      ? selection.fields.filter((item) => item !== field)
      : [...selection.fields, field];
    onChange({
      ...selection,
      fields: fields.length > 0 ? fields : [field],
    });
  };

  const isSelected = (event: ScrapedEvent) =>
    selection.selectAll || selectedIds.has(eventKey(event));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-black/55">
          {preview.length === 1 ? "1 Eintrag" : `${preview.length} Einträge`} auf
          der Seite
          {selectedCount > 0 ? ` · ${selectedCount} ausgewählt` : ""}
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="w-fit text-sm font-medium text-black underline decoration-black/20 hover:decoration-black"
        >
          {allSelected ? "Auswahl aufheben" : "Alle auswählen"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SCRAPER_FIELDS.map((field) => {
          const active = selection.fields.includes(field);
          return (
            <button
              key={field}
              type="button"
              onClick={() => toggleField(field)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-black text-white"
                  : "bg-black/5 text-black/45 hover:bg-black/10"
              }`}
            >
              {FIELD_LABELS[field]}
            </button>
          );
        })}
      </div>

      <ul className="divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/10">
        {preview.map((event) => {
          const id = eventKey(event);
          const selected = isSelected(event);
          return (
            <li key={id}>
              <article
                className={`flex cursor-pointer gap-4 p-4 transition ${
                  selected ? "bg-black/[0.04]" : "bg-white hover:bg-black/[0.02]"
                }`}
                onClick={() => toggleItem(id)}
              >
                <span
                  className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    selected
                      ? "border-black bg-black text-white"
                      : "border-black/20 bg-white text-transparent"
                  }`}
                  aria-hidden
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path
                      d="M1 4l2.6 2.6L9 1.2"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>

                <FieldSlot
                  field="heroImage"
                  active={selection.fields.includes("heroImage")}
                  onToggle={toggleField}
                >
                  {event.heroImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.heroImage}
                      alt=""
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-black/5 text-[10px] text-black/30">
                      Bild
                    </span>
                  )}
                </FieldSlot>

                <div className="min-w-0 flex-1">
                  <FieldSlot
                    field="name"
                    active={selection.fields.includes("name")}
                    onToggle={toggleField}
                    className="block text-left text-sm font-semibold text-black"
                  >
                    {event.name}
                  </FieldSlot>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-black/60">
                    <FieldSlot
                      field="location"
                      active={selection.fields.includes("location")}
                      onToggle={toggleField}
                    >
                      {event.location ?? "Ort fehlt"}
                    </FieldSlot>
                    <FieldSlot
                      field="date"
                      active={selection.fields.includes("date")}
                      onToggle={toggleField}
                    >
                      {event.date ?? "Datum fehlt"}
                    </FieldSlot>
                    <FieldSlot
                      field="time"
                      active={selection.fields.includes("time")}
                      onToggle={toggleField}
                    >
                      {event.time ?? "Uhrzeit fehlt"}
                    </FieldSlot>
                    <FieldSlot
                      field="price"
                      active={selection.fields.includes("price")}
                      onToggle={toggleField}
                    >
                      {event.price ?? "Preis fehlt"}
                    </FieldSlot>
                  </div>
                  <FieldSlot
                    field="ticketUrl"
                    active={selection.fields.includes("ticketUrl")}
                    onToggle={toggleField}
                    className="mt-1 block max-w-full truncate text-left text-[12px] text-black/40"
                  >
                    {event.ticketUrl ?? "Ticketlink fehlt"}
                  </FieldSlot>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FieldSlot({
  field,
  active,
  onToggle,
  className,
  children,
}: {
  field: ScraperField;
  active: boolean;
  onToggle: (field: ScraperField) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={`${FIELD_LABELS[field]} ${active ? "abwählen" : "wählen"}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(field);
      }}
      className={`${className ?? ""} rounded-sm text-left transition ${
        active
          ? "decoration-transparent"
          : "opacity-35 line-through decoration-black/30"
      }`}
    >
      {children}
    </button>
  );
}
