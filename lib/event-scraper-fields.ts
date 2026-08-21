export type ProbeGroup = "event" | "param" | "meta" | "jsonld" | "page";

export type ProbeField = {
  key: string;
  label: string;
  group: ProbeGroup;
  sample: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  title: "Titel",
  description: "Beschreibung",
  image: "Bild",
  url: "URL",
  startdate: "Startdatum",
  enddate: "Enddatum",
  date: "Datum",
  datetime: "Datum",
  location: "Location",
  address: "Adresse",
  city: "Stadt",
  venue: "Venue",
  performer: "Artist",
  artist: "Artist",
  organizer: "Veranstalter",
  offers: "Angebot",
  price: "Preis",
  pricecurrency: "Währung",
  lowprice: "Preis ab",
  highprice: "Preis bis",
  category: "Kategorie",
  genre: "Genre",
  eventstatus: "Status",
  eventattendancemode: "Teilnahme",
  availability: "Verfügbarkeit",
  ticket: "Ticket",
  canonical: "Canonical",
  sitename: "Website",
  type: "Typ",
};

export function labelForField(raw: string): string {
  const cleaned = raw.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  const compact = cleaned.replace(/\s+/g, "").toLowerCase();
  if (FIELD_LABELS[compact]) return FIELD_LABELS[compact];
  const words = cleaned.trim();
  if (!words) return raw;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldsFromUrl(rawUrl: string): ProbeField[] {
  try {
    const parsed = new URL(rawUrl);
    const fields: ProbeField[] = [];

    parsed.searchParams.forEach((value, name) => {
      fields.push({
        key: `param.${name}`,
        label: labelForField(name),
        group: "param",
        sample: value || null,
      });
    });

    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let index = 0; index < segments.length - 1; index += 2) {
      const name = decodeURIComponent(segments[index] ?? "");
      const value = decodeURIComponent(segments[index + 1] ?? "");
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) continue;
      fields.push({
        key: `param.${name}`,
        label: labelForField(name),
        group: "param",
        sample: value || null,
      });
    }

    return fields;
  } catch {
    return [];
  }
}
