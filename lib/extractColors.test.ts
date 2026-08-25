import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildWebsiteFetchHeaders,
  extractColorsFromText,
  extractColorsFromWebsite,
  serializeColors,
  validatePublicUrl,
  type ColorHit,
} from "./extractColors";

test("buildWebsiteFetchHeaders sendet Chrome-UA statt Bot-Kennung", () => {
  const headers = buildWebsiteFetchHeaders("document");
  assert.match(headers["user-agent"], /Chrome\/\d+/);
  assert.doesNotMatch(headers["user-agent"], /BrandsystemColorExtractor/);
  assert.equal(headers["sec-fetch-dest"], "document");
  assert.equal(headers["sec-fetch-mode"], "navigate");
  assert.match(headers.accept, /text\/html/);
});

test("buildWebsiteFetchHeaders setzt Stylesheet-Header und Referer", () => {
  const headers = buildWebsiteFetchHeaders("stylesheet", {
    referer: "https://brand.example/",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });
  assert.equal(headers.accept, "text/css,*/*;q=0.1");
  assert.equal(headers["sec-fetch-dest"], "style");
  assert.equal(headers.referer, "https://brand.example/");
  assert.equal(headers["sec-ch-ua-platform"], '"Windows"');
});

test("validatePublicUrl akzeptiert Domain ohne http und ohne www", () => {
  assert.equal(validatePublicUrl("brand.example"), "https://brand.example/");
  assert.equal(validatePublicUrl("www.brand.example"), "https://www.brand.example/");
  assert.equal(
    validatePublicUrl("brand.example/path"),
    "https://brand.example/path"
  );
  assert.equal(
    validatePublicUrl("https://brand.example/path"),
    "https://brand.example/path"
  );
  assert.equal(validatePublicUrl("//brand.example"), "https://brand.example/");
});

test("validatePublicUrl lehnt interne Hosts ab", () => {
  assert.throws(() => validatePublicUrl("ftp://example.com"), /http\/https/);
  assert.throws(() => validatePublicUrl("https://localhost/"), /private/);
  assert.throws(() => validatePublicUrl("https://192.168.0.10/"), /private/);
  assert.throws(() => validatePublicUrl("localhost"), /private/);
});

test("extractColorsFromText erkennt hex, rgb, hsl und Namen", () => {
  const map = new Map<string, ColorHit>();
  extractColorsFromText(
    "color:#1a2b3c; background: rgb(255, 0, 0); border: hsl(120, 100%, 50%); fill: navy;",
    "unit",
    map
  );
  assert.equal(map.get("#1A2B3C")?.count, 1);
  assert.equal(map.get("#FF0000")?.count, 1);
  assert.equal(map.get("#00FF00")?.count, 1);
  assert.equal(map.get("#000080")?.count, 1);
});

test("serializeColors sortiert nach Haeufigkeit", () => {
  const map = new Map<string, ColorHit>();
  extractColorsFromText("#111111 #222222 #111111", "unit", map);
  const serialized = serializeColors(map);
  assert.equal(serialized[0]?.hex, "#111111");
  assert.equal(serialized[0]?.count, 2);
});

test("extractColorsFromWebsite akzeptiert Domain ohne Protokoll", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return new Response(`<html><style>.x{color:#99AABB}</style></html>`, {
      status: 200,
    });
  }) as typeof fetch;

  try {
    const map = await extractColorsFromWebsite("brand.example");
    assert.ok((map.get("#99AABB")?.count ?? 0) >= 1);
    assert.ok(urls[0]?.startsWith("https://brand.example"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("extractColorsFromWebsite nutzt Browser-Headers", async () => {
  const originalFetch = globalThis.fetch;
  const userAgents: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    userAgents.push(headers["user-agent"] ?? "");
    return new Response(
      `<html><style>.brand { color: #112233; }</style></html>`,
      { status: 200, headers: { "content-type": "text/html" } }
    );
  }) as typeof fetch;

  try {
    const map = await extractColorsFromWebsite("https://brand.example");
    assert.ok((map.get("#112233")?.count ?? 0) >= 1);
    assert.equal(userAgents.length, 1);
    assert.match(userAgents[0] ?? "", /Chrome\/\d+/);
    assert.doesNotMatch(userAgents[0] ?? "", /BrandsystemColorExtractor/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("extractColorsFromWebsite wiederholt 403 mit Fallback-UA", async () => {
  const originalFetch = globalThis.fetch;
  const userAgents: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const ua = headers["user-agent"] ?? "";
    userAgents.push(ua);
    if (!/Windows NT/.test(ua)) {
      return new Response("blocked", { status: 403 });
    }
    return new Response(`<html><body style="color:#ABCDEF"></body></html>`, {
      status: 200,
    });
  }) as typeof fetch;

  try {
    const map = await extractColorsFromWebsite("https://brand.example");
    assert.equal(map.get("#ABCDEF")?.count, 1);
    assert.equal(userAgents.length, 2);
    assert.match(userAgents[0] ?? "", /Macintosh/);
    assert.match(userAgents[1] ?? "", /Windows NT/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("extractColorsFromWebsite versucht www-Variante nach 403", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("://blocked.example")) {
      return new Response("blocked", { status: 403 });
    }
    return new Response(`<html><style>h1{color:#445566}</style></html>`, {
      status: 200,
    });
  }) as typeof fetch;

  try {
    const map = await extractColorsFromWebsite("https://blocked.example");
    assert.ok((map.get("#445566")?.count ?? 0) >= 1);
    assert.ok(urls.some((url) => url.includes("://www.blocked.example")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
