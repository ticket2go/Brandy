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

export type GenerateIdmlOptions = {
  brandName: string;
  colors: IdmlColorInput[];
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

function buildGraphicXml(colors: IdmlColorInput[]): string {
  // Pflicht-Swatches, die InDesign in jedem Dokument erwartet. Ohne sie
  // laesst sich das IDML zwar oeffnen, InDesign ergaenzt sie dann beim
  // Speichern selbst; wir legen sie der Sauberkeit halber an.
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

  // Duplikate (gleicher Name) filtern, sonst beschwert sich InDesign.
  const seenNames = new Set<string>(["Black", "Paper", "Registration", "Cyan", "Magenta", "Yellow"]);
  const customColorXml: string[] = [];
  for (const c of colors) {
    let name = sanitizeColorName(c.name);
    if (!name) continue;
    let uniqueName = name;
    let suffix = 2;
    while (seenNames.has(uniqueName)) {
      uniqueName = `${name} (${suffix++})`;
    }
    seenNames.add(uniqueName);
    customColorXml.push(buildColorXml({ ...c, name: uniqueName }));
  }

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

function buildPreferencesXml(): string {
  // A4 im Querformat wuerde PageWidth > PageHeight sein; wir bleiben bei
  // Standard-A4 Hochformat in Punkt (595.2756 x 841.8898).
  return `${XML_HEADER}
<idPkg:Preferences ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<DocumentPreference PageHeight="841.8897637795276" PageWidth="595.2755905511812" PagesPerDocument="1" FacingPages="false" DocumentBleedTopOffset="0" DocumentBleedBottomOffset="0" DocumentBleedInsideOrLeftOffset="0" DocumentBleedOutsideOrRightOffset="0" SlugTopOffset="0" SlugBottomOffset="0" SlugInsideOrLeftOffset="0" SlugRightOrOutsideOffset="0" PreserveLayoutWhenShuffling="true" AllowPageShuffle="true" ColumnGuideLocked="true" Intent="PrintIntent" PageBinding="LeftToRight" ColumnDirection="Horizontal" MasterTextFrame="false"/>
\t<MarginPreference ColumnCount="1" ColumnGutter="12" Top="36" Bottom="36" Left="36" Right="36" ColumnDirection="Horizontal"/>
\t<TransparencyPreference BlendingSpace="CMYK"/>
\t<ViewPreference HorizontalMeasurementUnits="Millimeters" VerticalMeasurementUnits="Millimeters" RulerOrigin="PageOrigin"/>
\t<GuidePreference GuidesShown="true" GuidesLocked="false" GuidesSnapto="true"/>
\t<GridPreference DocumentGridShown="false" DocumentGridSnapto="false"/>
\t<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>
</idPkg:Preferences>`;
}

function buildMasterSpreadXml(masterSelf: string, pageSelf: string): string {
  return `${XML_HEADER}
<idPkg:MasterSpread ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<MasterSpread Self="${masterSelf}" Name="A-Master" NamePrefix="A" BaseName="Master" ShowMasterItems="true" PageCount="1" ItemTransform="1 0 0 1 0 0" OverriddenPageItemProps="">
\t\t<Properties>
\t\t\t<PageColor type="enumeration">UseMasterColor</PageColor>
\t\t</Properties>
\t\t<Page Self="${pageSelf}" GeometricBounds="0 0 841.8897637795276 595.2755905511812" ItemTransform="1 0 0 1 0 -420.9448818897638" Name="A" AppliedTrapPreset="TrapPreset/$ID/kDefaultTrapStyleName" OverrideList="" AppliedMaster="n" MasterPageTransform="1 0 0 1 0 0" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">
\t\t\t<Properties>
\t\t\t\t<PageColor type="enumeration">UseMasterColor</PageColor>
\t\t\t</Properties>
\t\t\t<MarginPreference ColumnCount="1" ColumnGutter="12" Top="36" Bottom="36" Left="36" Right="36" ColumnDirection="Horizontal"/>
\t\t</Page>
\t</MasterSpread>
</idPkg:MasterSpread>`;
}

function buildSpreadXml(spreadSelf: string, pageSelf: string, masterSelf: string): string {
  return `${XML_HEADER}
<idPkg:Spread ${IDPKG_NS} DOMVersion="${DOM_VERSION}">
\t<Spread Self="${spreadSelf}" FlattenerOverride="Default" AllowPageShuffle="true" ItemTransform="1 0 0 1 0 0" ShowMasterItems="true" PageCount="1" BindingLocation="0" PageTransitionType="None" PageTransitionDirection="NotApplicable" PageTransitionDuration="Medium">
\t\t<FlattenerPreference LineArtAndTextResolution="300" GradientAndMeshResolution="150" ClipComplexRegions="false" ConvertAllStrokesToOutlines="false" ConvertAllTextToOutlines="false">
\t\t\t<Properties>
\t\t\t\t<RasterVectorBalance type="double">50</RasterVectorBalance>
\t\t\t</Properties>
\t\t</FlattenerPreference>
\t\t<Page Self="${pageSelf}" GeometricBounds="0 0 841.8897637795276 595.2755905511812" ItemTransform="1 0 0 1 0 -420.9448818897638" Name="1" AppliedTrapPreset="TrapPreset/$ID/kDefaultTrapStyleName" OverrideList="" AppliedMaster="${masterSelf}" MasterPageTransform="1 0 0 1 0 0" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">
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
\t</Spread>
</idPkg:Spread>`;
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
  storySelf: string;
}): string {
  const { spreadSelf, masterSelf, layerSelf, storySelf } = params;
  return `${XML_HEADER}
<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="7.5(142)" ?>
<Document ${IDPKG_NS} DOMVersion="${DOM_VERSION}" Self="d" StoryList="${storySelf}" ZeroPoint="0 0" ActiveLayer="${layerSelf}" CMYKProfile="$ID/" RGBProfile="$ID/" SolidColorIntent="UseColorSettings" AfterBlendingIntent="UseColorSettings" DefaultImageIntent="UseColorSettings" RGBPolicy="ColorPolicyOff" CMYKPolicy="ColorPolicyOff" AccurateLABSpots="false">
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
  const zip = new JSZip();

  // Wichtig: `mimetype` muss die erste Datei im ZIP sein und darf nicht
  // komprimiert werden, sonst identifizieren manche Tools das Paket nicht
  // korrekt (OCF-Konvention).
  zip.file("mimetype", buildMimetype(), { compression: "STORE" });

  zip.file("META-INF/container.xml", buildContainerXml());

  const spreadSelf = "spread1";
  const masterSelf = "master1";
  const layerSelf = "layer1";
  const storySelf = "story1";
  const masterPageSelf = "masterpage1";
  const spreadPageSelf = spreadSelfToPageId(spreadSelf);

  zip.file(
    "designmap.xml",
    buildDesignmapXml({ spreadSelf, masterSelf, layerSelf, storySelf })
  );

  zip.file("Resources/Graphic.xml", buildGraphicXml(colors));
  zip.file("Resources/Fonts.xml", buildFontsXml());
  zip.file("Resources/Styles.xml", buildStylesXml());
  zip.file("Resources/Preferences.xml", buildPreferencesXml());

  zip.file(
    `MasterSpreads/MasterSpread_${masterSelf}.xml`,
    buildMasterSpreadXml(masterSelf, masterPageSelf)
  );
  zip.file(
    `Spreads/Spread_${spreadSelf}.xml`,
    buildSpreadXml(spreadSelf, spreadPageSelf, masterSelf)
  );

  zip.file("XML/BackingStory.xml", buildBackingStoryXml(storySelf));
  zip.file("XML/Tags.xml", buildTagsXml());

  // Metadatei: nur informativ, brandName als Titel.
  const _title = brandName; // Platzhalter, falls spaeter in Preferences eingebettet.
  void _title;

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
