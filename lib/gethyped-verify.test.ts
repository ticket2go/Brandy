import assert from "node:assert/strict";
import { test } from "node:test";

import { itemHasImage } from "./gethyped-verify";
import { ingestOutcomeOf, ingestSummaryOf } from "./ingest-progress";

test("erkennt gespeicherte Bilder in Batch-Items", () => {
  assert.equal(itemHasImage({ image_url: "https://cdn.test/a.jpg" }), true);
  assert.equal(itemHasImage({ has_image: true }), true);
  assert.equal(itemHasImage({ image_status: "stored" }), true);
  assert.equal(itemHasImage({ event: { cover_url: "https://cdn.test/b.jpg" } }), true);
  assert.equal(itemHasImage({ has_image: false }), false);
  assert.equal(itemHasImage({ image_status: "missing" }), false);
  assert.equal(itemHasImage({ name: "Ohne Bildfeld" }), null);
});

test("ordnet den Gesamtstatus nach Events und Bildern", () => {
  assert.equal(
    ingestOutcomeOf({
      sent: 10,
      accepted: 10,
      rejected: 0,
      withImage: 10,
      imagesConfirmed: 10,
      error: null,
    }),
    "success"
  );
  assert.equal(
    ingestOutcomeOf({
      sent: 10,
      accepted: 10,
      rejected: 0,
      withImage: 10,
      imagesConfirmed: 4,
      error: null,
    }),
    "partial"
  );
  assert.equal(
    ingestOutcomeOf({
      sent: 10,
      accepted: 0,
      rejected: 0,
      withImage: 0,
      imagesConfirmed: null,
      error: "Token ungültig",
    }),
    "failed"
  );
  assert.match(
    ingestSummaryOf({
      sent: 10,
      accepted: 10,
      rejected: 0,
      skipped: 0,
      withImage: 10,
      imagesConfirmed: 10,
      imagesMissing: 0,
      error: null,
      outcome: "success",
    }),
    /Alles erfolgreich/
  );
});
