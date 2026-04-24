import JSZip from "jszip";

import { clamp, hexToCmyk, hexToRgb } from "./color";

export type IdmlColorGroup = "print" | "digital";

export type IdmlColorInput = {
  name: string;
  hex: string;
  group: IdmlColorGroup;
  /**
   * Wenn gesetzt, wird die Farbe in InDesign als Spot-Farbe (Volltonfarbe)
   * angelegt. Der CMYK-Wert wird dabei aus `hex` abgeleitet, falls nicht
   * separat angegeben.
   */
  isSpot?: boolean;
};

/**
 * Seitenformat in Punkt (1 pt = 1/72 inch). Breite und Höhe beziehen sich
 * bereits auf die gewünschte Orientierung (Hoch- oder Querformat).
 */
export type IdmlPageSize = {
  widthPt: number;
  heightPt: number;
};

/** Presets für gängige Seitenformate in Millimeter. */
export const IDML_PAGE_PRESETS_MM: Record<
  "A3" | "A4" | "A5" | "Letter" | "Square",
  { widthMm: number; heightMm: number }
> = {
  A3: { widthMm: 297, heightMm: 420 },
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Square: { widthMm: 210, heightMm: 210 },
};

export function mmToPt(mm: number): number {
  return (mm / 25.4) * 72;
}

export function buildPageSizeFromMm(
  widthMm: number,
  heightMm: number,
  orientation: "portrait" | "landscape" = "portrait"
): IdmlPageSize {
  const w = mmToPt(widthMm);
  const h = mmToPt(heightMm);
  if (orientation === "landscape") {
    return { widthPt: Math.max(w, h), heightPt: Math.min(w, h) };
  }
  return { widthPt: Math.min(w, h), heightPt: Math.max(w, h) };
}

export type GenerateIdmlOptions = {
  brandName: string;
  colors: IdmlColorInput[];
  /** Seitenformat in Punkt. Default: A4 Hochformat. */
  pageSize?: IdmlPageSize;
};

// XML-Escape (Attribute und Text)
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// InDesign verbietet / in Namen – ersetzen.
function sanitizeColorName(name: string): string {
  return name.replace(/[\/\\]/g, "-").trim() || "Unnamed";
}

// Erzeugt den Self-Bezeichner fuer eine Farbe. Nicht-ASCII-Zeichen werden
// (wie InDesign selbst) in %NN-Escapes ueberfuehrt, damit der Wert innerhalb
// eines XML-Attributs stabil bleibt.
function colorSelf(name: string): string {
  const sanitized = sanitizeColorName(name);
  const encoded = sanitized.replace(/[^\x20-\x7E]/g, (c) => {
    const bytes = new TextEncoder().encode(c);
    let out = "";
    for (const byte of bytes) out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    return out;
  });
  return `Color/${encoded}`;
}

function formatColorValue(hex: string, group: IdmlColorGroup): {
  space: "CMYK" | "RGB";
  value: string;
} {
  if (group === "print") {
    const cmyk = hexToCmyk(hex);
    if (cmyk) {
      return {
        space: "CMYK",
        value: `${clamp(cmyk.c, 0, 100)} ${clamp(cmyk.m, 0, 100)} ${clamp(
          cmyk.y,
          0,
          100
        )} ${clamp(cmyk.k, 0, 100)}`,
      };
    }
  }
  const rgb = hexToRgb(hex);
  if (rgb) {
    return {
      space: "RGB",
      value: `${clamp(rgb.r, 0, 255)} ${clamp(rgb.g, 0, 255)} ${clamp(
        rgb.b,
        0,
        255
      )}`,
    };
  }
  return { space: "CMYK", value: "0 0 0 100" };
}

function buildColorXml(color: IdmlColorInput): string {
  const name = sanitizeColorName(color.name);
  const self = colorSelf(name);
  const { space, value } = formatColorValue(color.hex, color.group);
  const model = color.isSpot ? "Spot" : "Process";

  const attrs = [
    `Self="${xmlEscape(self)}"`,
    `Model="${model}"`,
    `Space="${space}"`,
    `ColorValue="${value}"`,
    `ColorOverride="Normal"`,
    `AlternateSpace="NoAlternateColor"`,
    `AlternateColorValue=""`,
    `Name="${xmlEscape(name)}"`,
    `ColorEditable="true"`,
    `ColorRemovable="true"`,
    `Visible="true"`,
    `SwatchCreatorID="7937"`,
  ];
  return `\t<Color ${attrs.join(" ")}/>`;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const DOM_VERSION = "7.5";
const IDPKG_NS =
  'xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"';

function buildMimetype(): string {
  return "application/vnd.adobe.indesign-idml-package";
}

function buildContainerXml(): string {
  return `${XML_HEADER}
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
\t<rootfiles>
\t\t<rootfile full-path="designmap.xml" media-type="text/xml">
\t\t</rootfile>
\t</rootfiles>
</container>`;
}

/**
 * Repräsentiert eine Farbe samt eindeutigem (nach Duplikat-Entschärfung) Namen
 * und Self-ID. Wird intern sowohl für das Graphic-XML als auch für die
 * Palette-Seite verwendet, damit FillColor-Referenzen übereinstimmen.
 */
type PreparedColor = {
  input: IdmlColorInput;
  uniqueName: string;
  self: string;
};

function prepareColors(colors: IdmlColorInput[]): PreparedColor[] {
  const seenNames = new Set<string>([
    "Black",
    "Paper",
    "Registration",
    "Cyan",
    "Magenta",
    "Yellow",
  ]);
  const prepared: PreparedColor[] = [];
  for (const c of colors) {
    const baseName = sanitizeColorName(c.name);
    if (!baseName) continue;
    let uniqueName = baseName;
    let suffix = 2;
    while (seenNames.has(uniqueName)) {
      uniqueName = `${baseName} (${suffix++})`;
    }
    seenNames.add(uniqueName);
    prepared.push({
      input: c,
      uniqueName,
      self: colorSelf(uniqueName),
    });
  }
  return prepared;
}

function buildGraphicXml(prepared: PreparedColor[]): string {
  const reserved = [
    '\t<Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" ColorOverride="Specialblack" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Black" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>',
    '\t<Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" ColorOverride="Specialpaper" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Paper" ColorEditable="true" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>',
    '\t<Color Self="Color/Registration" Model="Registration" Space="CMYK" ColorValue="100 100 100 100" ColorOverride="Specialregistration" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Registration" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>',
    '\t<Color Self="Color/Cyan" Model="Process" Space="CMYK" ColorValue="100 0 0 0" ColorOverride="Hiddenreserved" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Cyan" ColorEditable="false" ColorRemovable="false" Visible="false" SwatchCreatorID="7937"/>',
    '\t<Color Self="Color/Magenta" Model="Process" Space="CMYK" ColorValue="0 100 0 0" ColorOverride="Hiddenreserved" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Magenta" ColorEditable="false" ColorRemovable="false" Visible="false" SwatchCreatorID="7937"/>',
    '\t<Color Self="Color/Yellow" Model="Process" Space="CMYK" ColorValue="0 0 100 0" ColorOverride="Hiddenreserved" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Yellow" ColorEditable="false" ColorRemovable="false" Visible="false" SwatchCreatorID="7937"/>',
  ].join("\n");

  const inks = [
    '\t<Ink Self="Ink/$ID/Process Cyan" Name="$ID/Process Cyan" Angle="75" ConvertToProcess="false" Frequency="70" NeutralDensity="0.61" PrintInk="true" TrapOrder="1" InkType="Normal"/>',
    '\t<Ink Self="Ink/$ID/Process Magenta" Name="$ID/Process Magenta" Angle="15" ConvertToProcess="false" Frequency="70" NeutralDensity="0.76" PrintInk="true" TrapOrder="2" InkType="Normal"/>',
    '\t<Ink Self="Ink/$ID/Process Yellow" Name="$ID/Process Yellow" Angle="0" ConvertToProcess="false" Frequency="70" NeutralDensity="0.16" PrintInk="true" TrapOrder="3" InkType="Normal"/>',
    '\t<Ink Self="Ink/$ID/Process Black" Name="$ID/Process Black" Angle="45" ConvertToProcess="false" Frequency="70" NeutralDensity="1.7" PrintInk="true" TrapOrder="4" InkType="Normal"/>',
  ].join("\n");

  const customColorXml = prepared.map((p) =>
    buildColorXml({ ...p.input, name: p.uniqueName })
  );

  const strokeStyles = [
    '\t<StrokeStyle Self="StrokeStyle/$ID/Solid" Name="$ID/Solid"/>',
  ].join("\n");

  const swatchNone =
    '\t<Swatch Self="Swatch/None" Name="None" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>';

  return `${XML_HEADER}
<idPkg:Graphic ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
${reserved}
${customColorXml.join("\n")}
${inks}
${swatchNone}
${strokeStyles}
</idPkg:Graphic>`;
}

function buildFontsXml(): string {
  return `${XML_HEADER}
<idPkg:Fonts ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
</idPkg:Fonts>`;
}

function buildStylesXml(): string {
  return `${XML_HEADER}
<idPkg:Styles ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<RootCharacterStyleGroup Self="char_root">
\t\t<CharacterStyle Self="CharacterStyle/$ID/[No character style]" Imported="false" Name="$ID/[No character style]"/>
\t</RootCharacterStyleGroup>
\t<RootParagraphStyleGroup Self="para_root">
\t\t<ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" Imported="false" FillColor="Color/Black"/>
\t\t<ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" Imported="false" NextStyle="ParagraphStyle/$ID/NormalParagraphStyle">
\t\t\t<Properties>
\t\t\t\t<BasedOn type="string">$ID/[No paragraph style]</BasedOn>
\t\t\t</Properties>
\t\t</ParagraphStyle>
\t</RootParagraphStyleGroup>
\t<RootCellStyleGroup Self="cell_root">
\t\t<CellStyle Self="CellStyle/$ID/[None]" Name="$ID/[None]" AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]"/>
\t</RootCellStyleGroup>
\t<RootTableStyleGroup Self="table_root">
\t\t<TableStyle Self="TableStyle/$ID/[No table style]" Name="$ID/[No table style]"/>
\t\t<TableStyle Self="TableStyle/$ID/[Basic Table]" Name="$ID/[Basic Table]">
\t\t\t<Properties>
\t\t\t\t<BasedOn type="string">$ID/[No table style]</BasedOn>
\t\t\t</Properties>
\t\t</TableStyle>
\t</RootTableStyleGroup>
\t<RootObjectStyleGroup Self="obj_root">
\t\t<ObjectStyle Self="ObjectStyle/$ID/[None]" Name="$ID/[None]" AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]"/>
\t\t<ObjectStyle Self="ObjectStyle/$ID/[Normal Graphics Frame]" Name="$ID/[Normal Graphics Frame]" AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]">
\t\t\t<Properties>
\t\t\t\t<BasedOn type="string">$ID/[None]</BasedOn>
\t\t\t</Properties>
\t\t</ObjectStyle>
\t\t<ObjectStyle Self="ObjectStyle/$ID/[Normal Text Frame]" Name="$ID/[Normal Text Frame]" AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">
\t\t\t<Properties>
\t\t\t\t<BasedOn type="string">$ID/[None]</BasedOn>
\t\t\t</Properties>
\t\t</ObjectStyle>
\t\t<ObjectStyle Self="ObjectStyle/$ID/[Normal Grid]" Name="$ID/[Normal Grid]" AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">
\t\t\t<Properties>
\t\t\t\t<BasedOn type="string">$ID/[None]</BasedOn>
\t\t\t</Properties>
\t\t</ObjectStyle>
\t</RootObjectStyleGroup>
\t<TOCStyle Self="TOCStyle/$ID/DefaultTOCStyleName" Name="$ID/DefaultTOCStyleName" TitleStyle="ParagraphStyle/$ID/[No paragraph style]"/>
\t<TrapPreset Self="TrapPreset/$ID/kDefaultTrapStyleName" Name="$ID/kDefaultTrapStyleName" DefaultTrapWidth="0.25" BlackWidth="0.5" TrapJoin="MiterEndJoin" TrapEnd="MiterTrapEnds" ObjectsToImages="true" ImagesToImages="true" InternalImages="false" OneBitImages="true" ImagePlacement="CenterEdges" StepThreshold="10" BlackColorThreshold="100" BlackDensity="1.6" SlidingTrapThreshold="70" ColorReduction="100"/>
</idPkg:Styles>`;
}

function buildPreferencesXml(pageSize: IdmlPageSize): string {
  return `${XML_HEADER}
<idPkg:Preferences ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<DocumentPreference PageHeight="${pageSize.heightPt}" PageWidth="${pageSize.widthPt}" PagesPerDocument="1" FacingPages="false" DocumentBleedTopOffset="0" DocumentBleedBottomOffset="0" DocumentBleedInsideOrLeftOffset="0" DocumentBleedOutsideOrRightOffset="0" SlugTopOffset="0" SlugBottomOffset="0" SlugInsideOrLeftOffset="0" SlugRightOrOutsideOffset="0" PreserveLayoutWhenShuffling="true" AllowPageShuffle="true" ColumnGuideLocked="true" Intent="PrintIntent" PageBinding="LeftToRight" ColumnDirection="Horizontal" MasterTextFrame="false"/>
\t<MarginPreference ColumnCount="1" ColumnGutter="12" Top="36" Bottom="36" Left="36" Right="36" ColumnDirection="Horizontal"/>
\t<TransparencyPreference BlendingSpace="CMYK"/>
\t<ViewPreference HorizontalMeasurementUnits="Millimeters" VerticalMeasurementUnits="Millimeters" RulerOrigin="PageOrigin"/>
\t<GuidePreference GuidesShown="true" GuidesLocked="false" GuidesSnapto="true"/>
\t<GridPreference DocumentGridShown="false" DocumentGridSnapto="false"/>
\t<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>
</idPkg:Preferences>`;
}

function buildMasterSpreadXml(
  masterSelf: string,
  pageSelf: string,
  pageSize: IdmlPageSize
): string {
  const w = pageSize.widthPt;
  const h = pageSize.heightPt;
  return `${XML_HEADER}
<idPkg:MasterSpread ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<MasterSpread Self="${masterSelf}" Name="A-Master" NamePrefix="A" BaseName="Master" ShowMasterItems="true" PageCount="1" ItemTransform="1 0 0 1 0 0" OverriddenPageItemProps="">
\t\t<Properties>
\t\t\t<PageColor type="enumeration">UseMasterColor</PageColor>
\t\t</Properties>
\t\t<Page Self="${pageSelf}" GeometricBounds="0 0 ${h} ${w}" ItemTransform="1 0 0 1 0 ${-h / 2}" Name="A" AppliedTrapPreset="TrapPreset/$ID/kDefaultTrapStyleName" OverrideList="" AppliedMaster="n" MasterPageTransform="1 0 0 1 0 0" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">
\t\t\t<Properties>
\t\t\t\t<PageColor type="enumeration">UseMasterColor</PageColor>
\t\t\t</Properties>
\t\t\t<MarginPreference ColumnCount="1" ColumnGutter="12" Top="36" Bottom="36" Left="36" Right="36" ColumnDirection="Horizontal"/>
\t\t</Page>
\t</MasterSpread>
</idPkg:MasterSpread>`;
}

/**
 * Beschreibt ein einzelnes Item (Rechteck mit Farbfüllung oder Textframe) auf
 * der Palette-Seite. Koordinaten sind in pt im Page-lokalen System (0,0 =
 * linke obere Ecke der Seite).
 */
type PageItemXml = string;

function rectPointArray(w: number, h: number): string {
  // Objekt-Ursprung liegt in der Mitte des Rechtecks: Punkte sind (-w/2,-h/2)
  // bis (w/2,h/2).
  const x = w / 2;
  const y = h / 2;
  const pt = (ax: number, ay: number) =>
    `\t\t\t\t\t\t<PathPointType Anchor="${ax} ${ay}" LeftDirection="${ax} ${ay}" RightDirection="${ax} ${ay}"/>`;
  return [
    "\t\t\t\t\t<PathPointArray>",
    pt(-x, -y),
    pt(-x, y),
    pt(x, y),
    pt(x, -y),
    "\t\t\t\t\t</PathPointArray>",
  ].join("\n");
}

function buildColorRectangle(
  self: string,
  pageX: number,
  pageY: number,
  w: number,
  h: number,
  pageH: number,
  fillColorSelf: string
): PageItemXml {
  // Umrechnung Page-Local -> Spread-Koordinaten: die Page ist im Spread um
  // -pageH/2 in y verschoben, und der Objekt-Ursprung liegt in der
  // Objekt-Mitte.
  const cx = pageX + w / 2;
  const cy = pageY + h / 2 - pageH / 2;
  return `\t\t<Rectangle Self="${self}" ItemLayer="layer1" Name="$ID/" Visible="true" GradientFillStart="0 0" GradientFillLength="0" GradientFillAngle="0" GradientStrokeStart="0 0" GradientStrokeLength="0" GradientStrokeAngle="0" ItemTransform="1 0 0 1 ${cx} ${cy}" StrokeWeight="0" StrokeColor="Swatch/None" FillColor="${fillColorSelf}" ContentType="Unassigned" OverriddenPageItemProps="" HorizontalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" VerticalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension">
\t\t\t<Properties>
\t\t\t\t<PathGeometry>
\t\t\t\t\t<GeometryPathType PathOpen="false">
${rectPointArray(w, h)}
\t\t\t\t\t</GeometryPathType>
\t\t\t\t</PathGeometry>
\t\t\t</Properties>
\t\t</Rectangle>`;
}

function buildTextFrame(
  self: string,
  storySelf: string,
  pageX: number,
  pageY: number,
  w: number,
  h: number,
  pageH: number
): PageItemXml {
  const cx = pageX + w / 2;
  const cy = pageY + h / 2 - pageH / 2;
  return `\t\t<TextFrame Self="${self}" ParentStory="${storySelf}" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemLayer="layer1" Visible="true" Name="$ID/" GradientFillStart="0 0" GradientFillLength="0" GradientFillAngle="0" GradientStrokeStart="0 0" GradientStrokeLength="0" GradientStrokeAngle="0" ItemTransform="1 0 0 1 ${cx} ${cy}" StrokeWeight="0" StrokeColor="Swatch/None" FillColor="Swatch/None">
\t\t\t<Properties>
\t\t\t\t<PathGeometry>
\t\t\t\t\t<GeometryPathType PathOpen="false">
${rectPointArray(w, h)}
\t\t\t\t\t</GeometryPathType>
\t\t\t\t</PathGeometry>
\t\t\t</Properties>
\t\t\t<TextFramePreference TextColumnCount="1" TextColumnGutter="12" TextColumnFixedWidth="${w}"/>
\t\t\t<TextWrapPreference Inverse="false" ApplyToMasterPageOnly="false" TextWrapSide="BothSides" TextWrapMode="None">
\t\t\t\t<Properties>
\t\t\t\t\t<TextWrapOffset Top="0" Left="0" Bottom="0" Right="0"/>
\t\t\t\t</Properties>
\t\t\t</TextWrapPreference>
\t\t</TextFrame>`;
}

type StoryParagraph = {
  pointSize: number;
  leading?: "Auto" | number;
  fillColor?: string; // Color/... self
  lines: string[];
};

function buildStoryXml(storySelf: string, paragraphs: StoryParagraph[]): string {
  const paraXml = paragraphs
    .map((p) => {
      const leading = p.leading === undefined ? "Auto" : String(p.leading);
      const fill = p.fillColor ?? "Color/Black";
      const contentLines = p.lines
        .map((line, idx) => {
          const esc = xmlEscape(line);
          if (idx === p.lines.length - 1) {
            return `\t\t\t\t<Content>${esc}</Content>`;
          }
          return `\t\t\t\t<Content>${esc}</Content>\n\t\t\t\t<Br/>`;
        })
        .join("\n");
      return `\t\t<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">
\t\t\t<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]" PointSize="${p.pointSize}" Leading="${leading}" FillColor="${fill}">
${contentLines}
\t\t\t</CharacterStyleRange>
\t\t</ParagraphStyleRange>`;
    })
    .join("\n");

  return `${XML_HEADER}
<idPkg:Story ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<Story Self="${storySelf}" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">
\t\t<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>
${paraXml}
\t</Story>
</idPkg:Story>`;
}

type SpreadBuildResult = {
  spreadXml: string;
  storyFiles: { path: string; xml: string }[];
  storySelfs: string[];
};

function buildPaletteSpread(params: {
  spreadSelf: string;
  pageSelf: string;
  masterSelf: string;
  pageSize: IdmlPageSize;
  brandName: string;
  prepared: PreparedColor[];
}): SpreadBuildResult {
  const { spreadSelf, pageSelf, masterSelf, pageSize, brandName, prepared } =
    params;
  const w = pageSize.widthPt;
  const h = pageSize.heightPt;

  const margin = 36;
  const titleFrameH = 72;
  const titleFontSize = 36;
  const gutter = 12;

  const items: PageItemXml[] = [];
  const storyFiles: { path: string; xml: string }[] = [];
  const storySelfs: string[] = [];

  // Brand-Titel oben auf der Seite.
  const titleStorySelf = "story_title";
  storySelfs.push(titleStorySelf);
  storyFiles.push({
    path: `Stories/Story_${titleStorySelf}.xml`,
    xml: buildStoryXml(titleStorySelf, [
      {
        pointSize: titleFontSize,
        leading: Math.round(titleFontSize * 1.1),
        lines: [brandName || "Brand"],
      },
    ]),
  });
  items.push(
    buildTextFrame(
      "frame_title",
      titleStorySelf,
      margin,
      margin,
      w - 2 * margin,
      titleFrameH,
      h
    )
  );

  // Farbraster. Layout ist abhängig von der Anzahl Farben.
  const n = prepared.length;
  const gridTop = margin + titleFrameH + gutter;
  const gridLeft = margin;
  const gridW = w - 2 * margin;
  const gridH = h - gridTop - margin;

  if (n > 0 && gridH > 0 && gridW > 0) {
    const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * (gridW / Math.max(gridH, 1))))));
    const rows = Math.ceil(n / cols);

    const cellW = (gridW - (cols - 1) * gutter) / cols;
    const cellH = (gridH - (rows - 1) * gutter) / rows;
    // Swatchfläche oben, Text unten. ~65/35 Split mit Minimum für Text.
    const textBlockH = Math.max(48, Math.min(cellH * 0.4, 110));
    const swatchH = cellH - textBlockH;

    prepared.forEach((p, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cellX = gridLeft + col * (cellW + gutter);
      const cellY = gridTop + row * (cellH + gutter);

      // Farbfläche.
      items.push(
        buildColorRectangle(
          `rect_color_${idx}`,
          cellX,
          cellY,
          cellW,
          swatchH,
          h,
          p.self
        )
      );

      // Beschriftungs-Textrahmen unter der Farbfläche.
      const textStorySelf = `story_label_${idx}`;
      storySelfs.push(textStorySelf);
      const rgb = hexToRgb(p.input.hex);
      const cmyk = hexToCmyk(p.input.hex);
      const hexLabel = p.input.hex.toUpperCase();

      const paragraphs: StoryParagraph[] = [];
      // Name
      paragraphs.push({
        pointSize: 11,
        leading: 14,
        lines: [p.uniqueName],
      });
      // HEX
      paragraphs.push({
        pointSize: 9,
        leading: 12,
        lines: [`HEX ${hexLabel}`],
      });
      // CMYK oder RGB je nach Gruppe.
      if (p.input.group === "print") {
        if (cmyk) {
          paragraphs.push({
            pointSize: 9,
            leading: 12,
            lines: [`CMYK ${cmyk.c} ${cmyk.m} ${cmyk.y} ${cmyk.k}`],
          });
        }
      } else if (rgb) {
        paragraphs.push({
          pointSize: 9,
          leading: 12,
          lines: [`RGB ${rgb.r} ${rgb.g} ${rgb.b}`],
        });
      }

      storyFiles.push({
        path: `Stories/Story_${textStorySelf}.xml`,
        xml: buildStoryXml(textStorySelf, paragraphs),
      });

      items.push(
        buildTextFrame(
          `frame_label_${idx}`,
          textStorySelf,
          cellX,
          cellY + swatchH + 4,
          cellW,
          textBlockH - 4,
          h
        )
      );
    });
  }

  const spreadXml = `${XML_HEADER}
<idPkg:Spread ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<Spread Self="${spreadSelf}" FlattenerOverride="Default" AllowPageShuffle="true" ItemTransform="1 0 0 1 0 0" ShowMasterItems="true" PageCount="1" BindingLocation="0" PageTransitionType="None" PageTransitionDirection="NotApplicable" PageTransitionDuration="Medium">
\t\t<FlattenerPreference LineArtAndTextResolution="300" GradientAndMeshResolution="150" ClipComplexRegions="false" ConvertAllStrokesToOutlines="false" ConvertAllTextToOutlines="false">
\t\t\t<Properties>
\t\t\t\t<RasterVectorBalance type="double">50</RasterVectorBalance>
\t\t\t</Properties>
\t\t</FlattenerPreference>
\t\t<Page Self="${pageSelf}" GeometricBounds="0 0 ${h} ${w}" ItemTransform="1 0 0 1 0 ${-h / 2}" Name="1" AppliedTrapPreset="TrapPreset/$ID/kDefaultTrapStyleName" OverrideList="" AppliedMaster="${masterSelf}" MasterPageTransform="1 0 0 1 0 0" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">
\t\t\t<Properties>
\t\t\t\t<Descriptor type="list">
\t\t\t\t\t<ListItem type="string"></ListItem>
\t\t\t\t\t<ListItem type="enumeration">Arabic</ListItem>
\t\t\t\t\t<ListItem type="boolean">true</ListItem>
\t\t\t\t\t<ListItem type="boolean">false</ListItem>
\t\t\t\t\t<ListItem type="long">1</ListItem>
\t\t\t\t\t<ListItem type="string"></ListItem>
\t\t\t\t</Descriptor>
\t\t\t\t<PageColor type="enumeration">UseMasterColor</PageColor>
\t\t\t</Properties>
\t\t\t<MarginPreference ColumnCount="1" ColumnGutter="12" Top="36" Bottom="36" Left="36" Right="36" ColumnDirection="Horizontal"/>
\t\t</Page>
${items.join("\n")}
\t</Spread>
</idPkg:Spread>`;

  return { spreadXml, storyFiles, storySelfs };
}

function buildBackingStoryXml(storySelf: string): string {
  return `${XML_HEADER}
<idPkg:BackingStory ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<XmlStory Self="${storySelf}" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">
\t\t<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle">
\t\t\t<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">
\t\t\t\t<Content></Content>
\t\t\t</CharacterStyleRange>
\t\t</ParagraphStyleRange>
\t</XmlStory>
</idPkg:BackingStory>`;
}

function buildTagsXml(): string {
  return `${XML_HEADER}
<idPkg:Tags ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<XMLTag Self="XMLTag/Root" Name="Root">
\t\t<Properties>
\t\t\t<TagColor type="enumeration">LightBlue</TagColor>
\t\t</Properties>
\t</XMLTag>
</idPkg:Tags>`;
}

function buildDesignmapXml(params: {
  spreadSelf: string;
  masterSelf: string;
  layerSelf: string;
  backingStorySelf: string;
  storySelfs: string[];
}): string {
  const { spreadSelf, masterSelf, layerSelf, backingStorySelf, storySelfs } =
    params;
  const storyListAttr = [backingStorySelf, ...storySelfs].join(" ");
  const storyRefs = storySelfs
    .map((s) => `\t<idPkg:Story src="Stories/Story_${s}.xml"/>`)
    .join("\n");
  return `${XML_HEADER}
<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="7.5(142)" ?>
<Document ${IDPKG_NS} DOMVersion="${DOM_VERSION}" Self="d" StoryList="${storyListAttr}" ZeroPoint="0 0" ActiveLayer="${layerSelf}" CMYKProfile="$ID/" RGBProfile="$ID/" SolidColorIntent="UseColorSettings" AfterBlendingIntent="UseColorSettings" DefaultImageIntent="UseColorSettings" RGBPolicy="ColorPolicyOff" CMYKPolicy="ColorPolicyOff" AccurateLABSpots="false">
\t<Language Self="Language/$ID/English%3a USA" Name="$ID/English: USA" SingleQuotes="\u2018\u2019" DoubleQuotes="\u201C\u201D" PrimaryLanguageName="$ID/English" SublanguageName="$ID/USA" Id="269" HyphenationVendor="Proximity" SpellingVendor="Proximity"/>
\t<idPkg:Graphic src="Resources/Graphic.xml"/>
\t<idPkg:Fonts src="Resources/Fonts.xml"/>
\t<idPkg:Styles src="Resources/Styles.xml"/>
\t<idPkg:Preferences src="Resources/Preferences.xml"/>
\t<idPkg:Tags src="XML/Tags.xml"/>
\t<Layer Self="${layerSelf}" Name="Layer 1" Visible="true" Locked="false" IgnoreWrap="false" ShowGuides="true" LockGuides="false" UI="true" Expendable="true" Printable="true">
\t\t<Properties>
\t\t\t<LayerColor type="enumeration">LightBlue</LayerColor>
\t\t</Properties>
\t</Layer>
\t<idPkg:MasterSpread src="MasterSpreads/MasterSpread_${masterSelf}.xml"/>
\t<idPkg:Spread src="Spreads/Spread_${spreadSelf}.xml"/>
${storyRefs}
\t<Section Self="section1" Length="1" Name="" ContinueNumbering="true" IncludeSectionPrefix="false" Marker="" PageStart="${spreadSelfToPageId(spreadSelf)}" SectionPrefix="">
\t\t<Properties>
\t\t\t<PageNumberStyle type="enumeration">Arabic</PageNumberStyle>
\t\t</Properties>
\t</Section>
\t<idPkg:BackingStory src="XML/BackingStory.xml"/>
</Document>`;
}

// Hilfskonstante: die Page im Spread heisst abgeleitet vom Spread-Self.
function spreadSelfToPageId(spreadSelf: string): string {
  return `${spreadSelf}p`;
}

/**
 * Generiert ein IDML-Paket (ZIP) als Blob. Kann im Browser via
 * `URL.createObjectURL` zum Download angeboten werden.
 */
export async function generateIdml(options: GenerateIdmlOptions): Promise<Blob> {
  const { brandName, colors } = options;
  const pageSize: IdmlPageSize =
    options.pageSize ?? buildPageSizeFromMm(210, 297, "portrait");

  const zip = new JSZip();

  // Wichtig: `mimetype` muss die erste Datei im ZIP sein und darf nicht
  // komprimiert werden, sonst identifizieren manche Tools das Paket nicht
  // korrekt (OCF-Konvention).
  zip.file("mimetype", buildMimetype(), { compression: "STORE" });

  zip.file("META-INF/container.xml", buildContainerXml());

  const spreadSelf = "spread1";
  const masterSelf = "master1";
  const layerSelf = "layer1";
  const backingStorySelf = "story1";
  const masterPageSelf = "masterpage1";
  const spreadPageSelf = spreadSelfToPageId(spreadSelf);

  const prepared = prepareColors(colors);

  const { spreadXml, storyFiles, storySelfs } = buildPaletteSpread({
    spreadSelf,
    pageSelf: spreadPageSelf,
    masterSelf,
    pageSize,
    brandName,
    prepared,
  });

  zip.file(
    "designmap.xml",
    buildDesignmapXml({
      spreadSelf,
      masterSelf,
      layerSelf,
      backingStorySelf,
      storySelfs,
    })
  );

  zip.file("Resources/Graphic.xml", buildGraphicXml(prepared));
  zip.file("Resources/Fonts.xml", buildFontsXml());
  zip.file("Resources/Styles.xml", buildStylesXml());
  zip.file("Resources/Preferences.xml", buildPreferencesXml(pageSize));

  zip.file(
    `MasterSpreads/MasterSpread_${masterSelf}.xml`,
    buildMasterSpreadXml(masterSelf, masterPageSelf, pageSize)
  );
  zip.file(`Spreads/Spread_${spreadSelf}.xml`, spreadXml);

  for (const sf of storyFiles) {
    zip.file(sf.path, sf.xml);
  }

  zip.file("XML/BackingStory.xml", buildBackingStoryXml(backingStorySelf));
  zip.file("XML/Tags.xml", buildTagsXml());

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.adobe.indesign-idml-package",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export function suggestIdmlFilename(brandName: string): string {
  const base =
    brandName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "brand";
  return `${base}-farben.idml`;
}
