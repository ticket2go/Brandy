export type BatchImageCheck = {
  checked: boolean;
  confirmed: number;
  missing: number;
};

const POLL_ATTEMPTS = 8;
const POLL_WAIT_MS = 1500;

export async function verifyBatchImages(
  base: string,
  token: string,
  batchIds: string[],
  onProgress?: (done: number, total: number) => void
): Promise<BatchImageCheck> {
  const result: BatchImageCheck = {
    checked: false,
    confirmed: 0,
    missing: 0,
  };
  if (batchIds.length === 0) return result;
  onProgress?.(0, batchIds.length);

  for (const [index, batchId] of batchIds.entries()) {
    const check = await pollOneBatch(base, token, batchId);
    if (check.checked) {
      result.checked = true;
      result.confirmed += check.confirmed;
      result.missing += check.missing;
    }
    onProgress?.(index + 1, batchIds.length);
  }
  return result;
}

async function pollOneBatch(
  base: string,
  token: string,
  batchId: string
): Promise<BatchImageCheck> {
  let last: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    last = await getJson(base, token, `/batches/${encodeURIComponent(batchId)}`);
    if (!last) {
      await sleep(POLL_WAIT_MS);
      continue;
    }
    if (isBatchSettled(last) || attempt === POLL_ATTEMPTS - 1) break;
    await sleep(POLL_WAIT_MS);
  }

  const fromSummary = imagesFromSummary(last);
  const items =
    (await getJson(
      base,
      token,
      `/batches/${encodeURIComponent(batchId)}/items`
    )) ?? last;

  const fromItems = imagesFromItems(items);
  if (fromItems) return fromItems;
  if (fromSummary) return fromSummary;
  return { checked: false, confirmed: 0, missing: 0 };
}

function isBatchSettled(payload: Record<string, unknown>): boolean {
  const status = String(
    payload.status ?? payload.state ?? payload.phase ?? ""
  ).toLowerCase();
  if (!status) return false;
  return /done|complete|completed|finished|failed|error|ready/.test(status);
}

function imagesFromSummary(
  payload: Record<string, unknown> | null
): BatchImageCheck | null {
  if (!payload) return null;
  const confirmed = firstNumber(payload, [
    "images_confirmed",
    "images_stored",
    "with_image",
    "withImage",
    "image_count",
  ]);
  const missing = firstNumber(payload, [
    "images_missing",
    "without_image",
    "withoutImage",
  ]);
  if (confirmed == null && missing == null) return null;
  return {
    checked: true,
    confirmed: confirmed ?? 0,
    missing: missing ?? 0,
  };
}

function imagesFromItems(payload: unknown): BatchImageCheck | null {
  const items = listOf(payload);
  if (!items || items.length === 0) return null;
  let confirmed = 0;
  let missing = 0;
  let sawImageField = false;
  for (const item of items) {
    const flag = itemHasImage(item);
    if (flag == null) continue;
    sawImageField = true;
    if (flag) confirmed += 1;
    else missing += 1;
  }
  if (!sawImageField) return null;
  return { checked: true, confirmed, missing };
}

export function itemHasImage(value: unknown): boolean | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const nested = [
    row.event,
    row.result,
    row.payload,
    row.data,
    row.item,
  ].find((item) => item && typeof item === "object") as
    | Record<string, unknown>
    | undefined;

  for (const record of [row, nested]) {
    if (!record) continue;
    if (typeof record.has_image === "boolean") return record.has_image;
    if (typeof record.hasImage === "boolean") return record.hasImage;
    const status = String(
      record.image_status ?? record.imageStatus ?? ""
    ).toLowerCase();
    if (status) {
      if (/ready|stored|ok|done|complete|downloaded|success/.test(status)) {
        return true;
      }
      if (/missing|failed|error|none|empty/.test(status)) return false;
    }
    const url =
      asUrl(record.image_url) ??
      asUrl(record.imageUrl) ??
      asUrl(record.cover_url) ??
      asUrl(record.coverUrl) ??
      asUrl(record.thumbnail) ??
      asUrl(record.image);
    if (url) return true;
    if (Array.isArray(record.images) && record.images.length > 0) return true;
    if (Array.isArray(record.media) && record.media.length > 0) return true;
  }
  return null;
}

async function getJson(
  base: string,
  token: string,
  path: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${base}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function listOf(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  for (const key of ["items", "events", "results", "data"]) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return null;
}

function firstNumber(
  payload: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function asUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return /^https?:\/\//i.test(text) ? text : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
