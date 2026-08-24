import assert from "node:assert/strict";
import { test } from "node:test";

import {
  rewriteListingToArtwork,
  publishHeroCandidates,
  upgradeHeroForPublish,
} from "./eventim-artwork";
import { mapScrapedEvent, parsePrice } from "./gethyped-map";
import type { ScrapedEvent } from "./scraped-event";

function event(patch: Partial<ScrapedEvent> = {}): ScrapedEvent {
  return {
    name: "PUR Arena Tour 2026",
    venue: "Kleine EWE Arena",
    city: "Oldenburg",
    location: "Kleine EWE Arena, Oldenburg",
    date: "Fr., 20.11.2026",
    time: "20:00 Uhr",
    startsAt: "2026-11-20T20:00:00+01:00",
    heroImage:
      "https://www.eventim.de/obj/media/DE-eventim/teaser/222x222/2025/pur-tickets-2025.jpg",
    ticketUrl: "https://www.eventim.de/event/pur-arena-tour-2026-123/",
    price: "ab 75,50 €",
    ...patch,
  };
}

test("mappt heroImage auf image_url", () => {
  const mapped = mapScrapedEvent(event());
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  assert.equal(
    mapped.event.image_url,
    "https://www.eventim.de/obj/media/DE-eventim/teaser/222x222/2025/pur-tickets-2025.jpg"
  );
  assert.equal(mapped.event.raw?.heroImage, mapped.event.image_url);
});

test("lässt Events ohne Bild durch, setzt image_url dann nicht", () => {
  const mapped = mapScrapedEvent(event({ heroImage: null }));
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  assert.equal(mapped.event.image_url, undefined);
});

test("verwirft relative oder private Bild-URLs", () => {
  const relative = mapScrapedEvent(event({ heroImage: "/obj/media/bild.jpg" }));
  assert.equal(relative.ok, true);
  if (relative.ok) assert.equal(relative.event.image_url, undefined);

  const local = mapScrapedEvent(
    event({ heroImage: "http://localhost:3000/hero.jpg" })
  );
  assert.equal(local.ok, true);
  if (local.ok) assert.equal(local.event.image_url, undefined);
});

test("formt 222er-Teaser in Artwork-Header um", () => {
  const listing =
    "https://www.eventim.de/obj/media/DE-eventim/teaser/222x222/2025/andre-rieu-26-tickets-2025.jpg";
  assert.equal(
    rewriteListingToArtwork(listing),
    "https://www.eventim.de/obj/media/DE-eventim/teaser/artworks/2025/andre-rieu-26-tickets-header.jpg"
  );
  const candidates = publishHeroCandidates(listing);
  assert.equal(candidates[0], rewriteListingToArtwork(listing));
  assert.ok(candidates.includes(listing));
});

test("liest den niedrigsten Preis", () => {
  assert.equal(parsePrice("ab 75,50 €"), 75.5);
  assert.equal(parsePrice("1.234,00 € – 2.000,00 €"), 1234);
});

test("hebt 222er-Teaser auf das Artwork-Header", async () => {
  const listing =
    "https://www.eventim.de/obj/media/DE-eventim/teaser/222x222/2025/andre-rieu-26-tickets-2025.jpg";
  const upgraded = await upgradeHeroForPublish(listing);
  assert.equal(
    upgraded,
    "https://www.eventim.de/obj/media/DE-eventim/teaser/artworks/2025/andre-rieu-26-tickets-header.jpg"
  );
});
