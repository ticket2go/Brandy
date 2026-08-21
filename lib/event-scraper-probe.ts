import { validatePublicUrl } from "@/lib/extractColors";
import {
  fieldsFromUrl,
  labelForField,
  type ProbeField,
  type ProbeGroup,
} from "@/lib/event-scraper-fields";
import {
  eventFieldsFromEvents,
  fetchEventimEvents,
  isEventimUrl,
  type EventimEvent,
} from "@/lib/eventim";

export type { ProbeField, ProbeGroup };
export { fieldsFromUrl };

export type ProbeResult = {
  url: string;
  hostname: string;
  title: string | null;
  fields: ProbeField[];
  events: EventimEvent[];
  warning: string | null;
};

const MAX_FETCH_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 4000;
const MAX_FIELDS = 80;
const MAX_SAMPLE = 160;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const SKIP_KEY =
  /token|password|secret|cookie|authorization|api[_-]?key|csrf|nonce|session/i;

const GROUP_ORDER: ProbeGroup[] = ["event", "param", "jsonld", "meta", "page"];

export async function probeScraperUrl(rawUrl: string): Promise<ProbeResult> {
  const url = validatePublicUrl(rawUrl);
  const parsed = new URL(url);
  const fields = new Map<string, ProbeField>();
  const warnings: string[] = [];
  let events: EventimEvent[] = [];

  addFields(fields, fieldsFromUrl(url));

  if (isEventimUrl(url)) {
    try {
      events = await fetchEventimEvents(url);
      addFields(fields, eventFieldsFromEvents(events));
      if (events.length === 0) {
        warnings.push("Zu dieser Suche wurden keine Events gefunden.");
      }
    } catch (error) {
      addFields(fields, eventFieldsFromEvents([]));
      warnings.push(
        error instanceof Error
          ? error.message
          : "Eventim-Eventdaten konnten nicht geladen werden."
      );
    }
  } else {
    try {
      const { body, contentType } = await fetchWithLimits(url);
      if (looksLikeJson(contentType, body)) {
        addFields(fields, collectJsonFields(body, "jsonld"));
      } else {
        addFields(fields, collectHtmlFields(body, parsed));
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "URL konnte nicht gelesen werden."
      );
    }
  }

  const title =
    events[0]?.name ??
    fields.get("event.name")?.sample ??
    fields.get("meta.title")?.sample ??
    fields.get("jsonld.name")?.sample ??
    null;

  return {
    url,
    hostname: parsed.hostname,
    title,
    fields: sortFields(Array.from(fields.values())).slice(0, MAX_FIELDS),
    events,
    warning: warnings[0] ?? null,
  };
}

function addFields(target: Map<string, ProbeField>, incoming: ProbeField[]) {
  for (const field of incoming) {
    if (!field.key || SKIP_KEY.test(field.key)) continue;
    const existing = target.get(field.key);
    if (!existing) {
      target.set(field.key, field);
      continue;
    }
    if (!existing.sample && field.sample) {
      target.set(field.key, field);
    }
  }
}

function collectHtmlFields(html: string, pageUrl: URL): ProbeField[] {
  const fields: ProbeField[] = [];

  const title = matchContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    fields.push({
      key: "meta.title",
      label: "Titel",
      group: "meta",
      sample: clip(stripTags(title)),
    });
  }

  const metaPattern = /<meta\b([^>]*)\/?>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaPattern.exec(html)) !== null) {
    const attrs = metaMatch[1] ?? "";
    const name =
      getAttr(attrs, "property") ??
      getAttr(attrs, "name") ??
      getAttr(attrs, "itemprop");
    const content = getAttr(attrs, "content");
    if (!name || !content) continue;
    const normalized = name.toLowerCase();
    if (
      !/^(og:|twitter:|description|title|keywords|author|date|article:|event)/.test(
        normalized
      )
    ) {
      continue;
    }
    fields.push({
      key: `meta.${normalized}`,
      label: labelForField(normalized.replace(/^(og|twitter|article):/, "")),
      group: "meta",
      sample: clip(content),
    });
  }

  const canonical = html.match(
    /<link\b[^>]*rel=["']canonical["'][^>]*>/i
  )?.[0];
  const canonicalHref = canonical ? getAttr(canonical, "href") : null;
  if (canonicalHref) {
    fields.push({
      key: "meta.canonical",
      label: "Canonical",
      group: "meta",
      sample: clip(canonicalHref),
    });
  }

  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    const attrs = scriptMatch[1] ?? "";
    const type = (getAttr(attrs, "type") ?? "").toLowerCase();
    const id = getAttr(attrs, "id") ?? "";
    const raw = (scriptMatch[2] ?? "").trim();
    if (!raw) continue;

    if (type.includes("ld+json") || type === "application/json" || id === "__NEXT_DATA__") {
      const group: ProbeGroup = type.includes("ld+json") ? "jsonld" : "page";
      addAll(fields, collectJsonFields(raw, group));
    }
  }

  const h1 = matchContent(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    fields.push({
      key: "page.heading",
      label: "Überschrift",
      group: "page",
      sample: clip(stripTags(h1)),
    });
  }

  const timePattern = /<time\b([^>]*)>([\s\S]*?)<\/time>/gi;
  let timeMatch: RegExpExecArray | null;
  while ((timeMatch = timePattern.exec(html)) !== null) {
    const datetime = getAttr(timeMatch[1] ?? "", "datetime") ?? stripTags(timeMatch[2] ?? "");
    if (!datetime) continue;
    fields.push({
      key: "page.datetime",
      label: "Datum",
      group: "page",
      sample: clip(datetime),
    });
    break;
  }

  const itempropPattern = /<[^>]+\bitemprop=["']([^"']+)["'][^>]*>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itempropPattern.exec(html)) !== null) {
    const prop = itemMatch[1];
    if (!prop || SKIP_KEY.test(prop)) continue;
    const tag = itemMatch[0];
    const sample =
      getAttr(tag, "content") ??
      getAttr(tag, "datetime") ??
      getAttr(tag, "href") ??
      null;
    fields.push({
      key: `page.itemprop.${prop}`,
      label: labelForField(prop),
      group: "page",
      sample: clip(sample),
    });
  }

  const dataPattern =
    /\bdata-((?:event|artist|venue|location|city|date|price|title|name|category|genre|ticket)[a-z0-9_-]*)=["']([^"']*)["']/gi;
  let dataMatch: RegExpExecArray | null;
  while ((dataMatch = dataPattern.exec(html)) !== null) {
    const attr = dataMatch[1];
    fields.push({
      key: `page.data.${attr}`,
      label: labelForField(attr),
      group: "page",
      sample: clip(dataMatch[2]),
    });
  }

  addAll(fields, collectDomainParams(html, pageUrl));
  return fields;
}

function collectDomainParams(html: string, pageUrl: URL): ProbeField[] {
  const fields: ProbeField[] = [];
  const hrefPattern = /\b(?:href|action)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    let resolved: URL;
    try {
      resolved = new URL(match[1], pageUrl);
    } catch {
      continue;
    }
    if (resolved.hostname !== pageUrl.hostname) continue;
    resolved.searchParams.forEach((value, name) => {
      if (!name || SKIP_KEY.test(name)) return;
      fields.push({
        key: `param.${name}`,
        label: labelForField(name),
        group: "param",
        sample: clip(value),
      });
    });
  }

  const inputPattern = /<(?:input|select|textarea)\b([^>]*)\/?>/gi;
  let inputMatch: RegExpExecArray | null;
  while ((inputMatch = inputPattern.exec(html)) !== null) {
    const attrs = inputMatch[1] ?? "";
    const type = (getAttr(attrs, "type") ?? "text").toLowerCase();
    if (["hidden", "password", "submit", "button", "image", "file"].includes(type)) {
      continue;
    }
    const name = getAttr(attrs, "name");
    if (!name || SKIP_KEY.test(name)) continue;
    fields.push({
      key: `param.${name}`,
      label: labelForField(name),
      group: "param",
      sample: clip(getAttr(attrs, "value")),
    });
  }

  return fields;
}

function collectJsonFields(raw: string, group: ProbeGroup): ProbeField[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const fields: ProbeField[] = [];
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  for (const root of roots) {
    walkJson(root, [], group, fields, 0);
  }
  return fields;
}

function walkJson(
  value: unknown,
  path: string[],
  group: ProbeGroup,
  out: ProbeField[],
  depth: number
) {
  if (value == null || depth > 6) return;
  if (Array.isArray(value)) {
    if (value.length > 0) walkJson(value[0], path, group, out, depth);
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const typeHint =
      typeof record["@type"] === "string" ? String(record["@type"]) : null;
    const nextPath =
      typeHint && path.length === 0 ? [typeHint] : path;
    for (const [key, nested] of Object.entries(record)) {
      if (key.startsWith("@") || SKIP_KEY.test(key)) continue;
      walkJson(nested, [...nextPath, key], group, out, depth + 1);
    }
    return;
  }
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return;
  }
  const sample = clip(String(value));
  if (!sample) return;
  if (path.length === 0) return;
  const leaf = path[path.length - 1] ?? "value";
  const key = `${group}.${path.join(".")}`;
  out.push({
    key,
    label: labelForField(leaf),
    group,
    sample,
  });
}

function addAll(target: ProbeField[], incoming: ProbeField[]) {
  target.push(...incoming);
}

function sortFields(fields: ProbeField[]): ProbeField[] {
  return [...fields].sort((a, b) => {
    const groupDiff = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (groupDiff !== 0) return groupDiff;
    return a.label.localeCompare(b.label, "de");
  });
}

function clip(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = decodeEntities(value).replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= MAX_SAMPLE) return normalized;
  return `${normalized.slice(0, MAX_SAMPLE - 1)}…`;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function matchContent(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern);
  return match?.[1] ?? null;
}

function getAttr(tag: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  );
  const match = tag.match(pattern);
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? "") || null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code))
    );
}

function looksLikeJson(contentType: string, body: string): boolean {
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return true;
  }
  const trimmed = body.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

async function fetchWithLimits(
  url: string
): Promise<{ body: string; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const reader = response.body?.getReader();
    if (!reader) {
      return { body: await response.text(), contentType };
    }

    const decoder = new TextDecoder();
    let received = 0;
    let result = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_FETCH_BYTES) {
        await reader.cancel();
        break;
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return { body: result, contentType };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Zeitüberschreitung beim Lesen der URL.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
