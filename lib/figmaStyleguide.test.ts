import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractStyleguide,
  shortName,
  weightName,
  type FigmaFile,
} from "./figmaStyleguide";
import { parseFigmaFileKey } from "./figmaUrl";

test("parseFigmaFileKey liest den Key aus design-, file- und proto-Links", () => {
  assert.equal(
    parseFigmaFileKey("https://www.figma.com/design/AvGZycFxMJ2mnp8xuwo8ZV/Brandy"),
    "AvGZycFxMJ2mnp8xuwo8ZV"
  );
  assert.equal(
    parseFigmaFileKey("https://figma.com/file/AvGZycFxMJ2mnp8xuwo8ZV"),
    "AvGZycFxMJ2mnp8xuwo8ZV"
  );
  assert.equal(
    parseFigmaFileKey("figma.com/proto/AvGZycFxMJ2mnp8xuwo8ZV?node-id=1-2"),
    "AvGZycFxMJ2mnp8xuwo8ZV"
  );
});

test("parseFigmaFileKey lehnt fremde und zu kurze Links ab", () => {
  assert.equal(parseFigmaFileKey("https://example.com/design/AvGZycFxMJ2mnp8xuwo8ZV"), null);
  assert.equal(parseFigmaFileKey("https://www.figma.com/design/kurz"), null);
  assert.equal(parseFigmaFileKey("kein link"), null);
});

test("shortName nimmt das letzte Segment eines Style-Pfads", () => {
  assert.equal(shortName("Brand/Primary"), "Primary");
  assert.equal(shortName("Primary"), "Primary");
  assert.equal(shortName("A/B/ C "), "C");
});

test("weightName bildet Figma-Gewichte auf Namen ab", () => {
  assert.equal(weightName(300, false), "Light");
  assert.equal(weightName(400, false), "Regular");
  assert.equal(weightName(700, true), "Bold Italic");
  assert.equal(weightName(900, false), "Black");
});

function makeFile(): FigmaFile {
  return {
    styles: {
      "s1": { styleType: "FILL", name: "Brand/Primary" },
      "s2": { styleType: "FILL", name: "Brand/Secondary" },
      "t1": { styleType: "TEXT", name: "Headline" },
    },
    document: {
      type: "DOCUMENT",
      children: [
        {
          type: "FRAME",
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
          styles: { fill: "s1" },
          children: [
            {
              type: "RECTANGLE",
              fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0 } }],
              styles: { fill: "s2" },
            },
            {
              type: "TEXT",
              styles: { text: "t1" },
              style: { fontFamily: "Epilogue", fontWeight: 700 },
              fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
            },
          ],
        },
      ],
    },
  };
}

test("extractStyleguide liest Farb-Styles mit Kurznamen und Fonts", () => {
  const result = extractStyleguide(makeFile());
  assert.equal(result.source, "styles");
  assert.deepEqual(
    result.colors.map((c) => [c.name, c.hex]),
    [
      ["Primary", "#FF0000"],
      ["Secondary", "#00FF00"],
    ]
  );
  assert.deepEqual(result.fonts, [
    { family: "Epilogue", weights: ["Bold"] },
  ]);
});

test("extractStyleguide ignoriert unsichtbare und nicht-solide Fills", () => {
  const file: FigmaFile = {
    styles: { s1: { styleType: "FILL", name: "Hidden" } },
    document: {
      children: [
        {
          type: "RECTANGLE",
          styles: { fill: "s1" },
          fills: [
            { type: "SOLID", visible: false, color: { r: 1, g: 0, b: 0 } },
            { type: "GRADIENT_LINEAR" },
          ],
        },
      ],
    },
  };
  const result = extractStyleguide(file);
  assert.equal(result.colors.length, 0);
});

test("Fallback nutzt meistgenutzte Fuellfarben ohne Schwarz und Weiss", () => {
  const node = (r: number, g: number, b: number) => ({
    type: "RECTANGLE",
    fills: [{ type: "SOLID", color: { r, g, b } }],
  });
  const file: FigmaFile = {
    document: {
      children: [
        node(0, 0, 1),
        node(0, 0, 1),
        node(0, 0, 1),
        node(1, 1, 1), // Weiss wird uebersprungen
        node(1, 1, 1),
        node(1, 1, 1),
        node(1, 1, 1),
        node(0, 0, 0), // Schwarz wird uebersprungen
        node(1, 0.5, 0),
      ],
    },
  };
  const result = extractStyleguide(file);
  assert.equal(result.source, "fills");
  assert.deepEqual(
    result.colors.map((c) => [c.name, c.hex, c.count]),
    [
      ["Farbe 1", "#0000FF", 3],
      ["Farbe 2", "#FF8000", 1],
    ]
  );
});

test("gleicher Kurzname: letzter Style gewinnt (wie im Laravel-Original)", () => {
  const file: FigmaFile = {
    styles: {
      s1: { styleType: "FILL", name: "Brand/Primary" },
      s2: { styleType: "FILL", name: "UI/Primary" },
    },
    document: {
      children: [
        {
          type: "RECTANGLE",
          styles: { fill: "s1" },
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
        },
        {
          type: "RECTANGLE",
          styles: { fill: "s2" },
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }],
        },
      ],
    },
  };
  const result = extractStyleguide(file);
  assert.deepEqual(
    result.colors.map((c) => [c.name, c.hex]),
    [["Primary", "#0000FF"]]
  );
});
