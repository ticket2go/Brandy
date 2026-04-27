"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";

import { supabase } from "@/lib/supabase/client";
import { cssFormatName, formatLabel, mimeTypeForFormat } from "@/lib/fontFormat";
import { useVisibilityReload } from "@/lib/useVisibilityReload";

import AddFontModal, { type AddFontSubmit } from "./AddFontModal";
import ConfirmDialog from "./ConfirmDialog";

const STORAGE_BUCKET = "brand-assets";

type BrandFont = {
  id: string;
  brand_id: string;
  family: string;
  source: "google" | "custom";
  license_confirmed: boolean;
  google_category: string | null;
  roles: string[];
  position: number;
};

type FontRole = {
  key: string;
  label: string;
  previewSize: string;
  previewWeight: number;
};

const FONT_ROLES: FontRole[] = [
  { key: "headline", label: "Headline", previewSize: "2.75rem", previewWeight: 700 },
  { key: "subline", label: "Subline", previewSize: "1.75rem", previewWeight: 600 },
  { key: "overline", label: "Overline", previewSize: "0.75rem", previewWeight: 600 },
  { key: "copy", label: "Copy", previewSize: "1rem", previewWeight: 400 },
  { key: "caption", label: "Caption", previewSize: "0.75rem", previewWeight: 400 },
  { key: "quote", label: "Quote", previewSize: "1.25rem", previewWeight: 400 },
  { key: "monospace", label: "Monospace", previewSize: "0.9rem", previewWeight: 400 },
];

const ROLE_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  FONT_ROLES.map((r) => [r.key, r.label])
);

type BrandFontFile = {
  id: string;
  font_id: string;
  variant: string;
  style_label: string;
  weight: number;
  italic: boolean;
  format: string;
  storage_path: string;
  size_bytes: number | null;
};

type TypographyPanelProps = {
  brandId: string;
  brandSlug: string;
};

function sanitizeSegment(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "font"
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function cssFamilyName(font: BrandFont): string {
  return `bf-${font.id}`;
}

export default function TypographyPanel({
  brandId,
  brandSlug,
}: TypographyPanelProps) {
  const [fonts, setFonts] = useState<BrandFont[]>([]);
  const [files, setFiles] = useState<BrandFontFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [fontToDelete, setFontToDelete] = useState<BrandFont | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [downloadingFontId, setDownloadingFontId] = useState<string | null>(
    null
  );
  const [exportingFontId, setExportingFontId] = useState<string | null>(null);
  const [convertingFontId, setConvertingFontId] = useState<string | null>(
    null
  );
  const [convertProgress, setConvertProgress] = useState<string | null>(null);

  const toggleCollapsed = (fontId: string) => {
    // Default ist eingeklappt (prev[fontId] === undefined -> isCollapsed === true).
    // Toggle zieht den Default auf "false" explizit mit.
    setCollapsed((prev) => {
      const currentCollapsed = prev[fontId] !== false;
      return { ...prev, [fontId]: currentCollapsed ? false : true };
    });
  };

  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    if (!hasDataRef.current) {
      setLoading(true);
    }
    setError(null);
    const [fontsRes, filesRes] = await Promise.all([
      supabase
        .from("brand_fonts")
        .select(
          "id, brand_id, family, source, license_confirmed, google_category, roles, position"
        )
        .eq("brand_id", brandId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("brand_font_files")
        .select(
          "id, font_id, variant, style_label, weight, italic, format, storage_path, size_bytes"
        ),
    ]);

    if (fontsRes.error) {
      if (!hasDataRef.current) setError(fontsRes.error.message);
    } else if (filesRes.error) {
      if (!hasDataRef.current) setError(filesRes.error.message);
    } else {
      hasDataRef.current = true;
      const fontRows = ((fontsRes.data ?? []) as BrandFont[]).map((f) => ({
        ...f,
        roles: Array.isArray(f.roles) ? f.roles : [],
      }));
      const fontIds = new Set(fontRows.map((f) => f.id));
      setFonts(fontRows);
      setFiles(
        ((filesRes.data ?? []) as BrandFontFile[]).filter((f) =>
          fontIds.has(f.font_id)
        )
      );
    }
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  useVisibilityReload(load);

  const filesByFont = useMemo(() => {
    const map = new Map<string, BrandFontFile[]>();
    for (const file of files) {
      if (!map.has(file.font_id)) map.set(file.font_id, []);
      map.get(file.font_id)!.push(file);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.weight !== b.weight) return a.weight - b.weight;
        if (a.italic !== b.italic) return Number(a.italic) - Number(b.italic);
        return a.format.localeCompare(b.format);
      });
    }
    return map;
  }, [files]);

  // Live @font-face Injection fuer Preview.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-brand-fonts", brandId);
    const rules: string[] = [];
    for (const font of fonts) {
      const familyName = cssFamilyName(font);
      const fontFiles = filesByFont.get(font.id) ?? [];
      // Fuer jede Gewicht/Italic-Kombi bevorzugt woff2 > woff > ttf/otf.
      const bestPerVariant = new Map<string, BrandFontFile>();
      for (const f of fontFiles) {
        const key = `${f.weight}-${f.italic ? 1 : 0}`;
        const current = bestPerVariant.get(key);
        const priority: Record<string, number> = {
          woff2: 0,
          woff: 1,
          ttf: 2,
          otf: 3,
          eot: 4,
        };
        const fPrio = priority[f.format] ?? 99;
        const cPrio = current ? (priority[current.format] ?? 99) : 100;
        if (fPrio < cPrio) bestPerVariant.set(key, f);
      }
      for (const file of bestPerVariant.values()) {
        const { data } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(file.storage_path);
        if (!data.publicUrl) continue;
        rules.push(
          `@font-face { font-family: '${familyName}'; src: url('${data.publicUrl}') format('${cssFormatName(file.format)}'); font-weight: ${file.weight}; font-style: ${file.italic ? "italic" : "normal"}; font-display: swap; }`
        );
      }
    }
    styleEl.textContent = rules.join("\n");
    document.head.appendChild(styleEl);
    return () => {
      styleEl.remove();
    };
  }, [fonts, filesByFont, brandId]);

  const handleSubmitAdd = async (payload: AddFontSubmit) => {
    const nextPosition =
      (fonts.reduce((max, f) => Math.max(max, f.position), -1) || 0) + 1;

    const { data: fontRow, error: fontError } = await supabase
      .from("brand_fonts")
      .insert({
        brand_id: brandId,
        family: payload.family,
        source: payload.source,
        license_confirmed: payload.licenseConfirmed,
        google_category:
          payload.source === "google" ? payload.category ?? null : null,
        roles: [],
        position: nextPosition,
      })
      .select(
        "id, brand_id, family, source, license_confirmed, google_category, roles, position"
      )
      .single();
    if (fontError) throw new Error(fontError.message);
    if (!fontRow) throw new Error("Schrift konnte nicht angelegt werden.");

    const newFont = fontRow as BrandFont;
    const familySlug = sanitizeSegment(payload.family);

    const uploadedFiles: BrandFontFile[] = [];

    // Dedupe auf (variant, format) - die DB hat dort einen Unique-Constraint,
    // und Google Fonts liefert manchmal mehrere Subsets fuer dieselbe Kombi.
    const dedupeKey = (variant: string, format: string) =>
      `${variant}::${format}`;
    const seenKeys = new Set<string>();

    try {
      if (payload.source === "google") {
        for (const file of payload.files) {
          const key = dedupeKey(file.variant, file.format);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          const path = `${brandSlug}/fonts/${familySlug}/${newFont.id}/${file.variant}.${file.format}`;
          const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(path, file.data, {
              upsert: true,
              contentType: file.contentType || mimeTypeForFormat(file.format),
              cacheControl: "31536000",
            });
          if (uploadError) throw new Error(uploadError.message);
          const { data: fileRow, error: fileError } = await supabase
            .from("brand_font_files")
            .insert({
              font_id: newFont.id,
              variant: file.variant,
              style_label: file.styleLabel,
              weight: file.weight,
              italic: file.italic,
              format: file.format,
              storage_path: path,
              size_bytes: file.size,
            })
            .select(
              "id, font_id, variant, style_label, weight, italic, format, storage_path, size_bytes"
            )
            .single();
          if (fileError) throw new Error(fileError.message);
          if (fileRow) uploadedFiles.push(fileRow as BrandFontFile);
        }
      } else {
        for (const entry of payload.files) {
          const key = dedupeKey(entry.variant, entry.format);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          const path = `${brandSlug}/fonts/${familySlug}/${newFont.id}/${entry.variant}.${entry.format}`;
          const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(path, entry.file, {
              upsert: true,
              contentType:
                entry.file.type || mimeTypeForFormat(entry.format),
              cacheControl: "31536000",
            });
          if (uploadError) throw new Error(uploadError.message);
          const { data: fileRow, error: fileError } = await supabase
            .from("brand_font_files")
            .insert({
              font_id: newFont.id,
              variant: entry.variant,
              style_label: entry.styleLabel,
              weight: entry.weight,
              italic: entry.italic,
              format: entry.format,
              storage_path: path,
              size_bytes: entry.file.size,
            })
            .select(
              "id, font_id, variant, style_label, weight, italic, format, storage_path, size_bytes"
            )
            .single();
          if (fileError) throw new Error(fileError.message);
          if (fileRow) uploadedFiles.push(fileRow as BrandFontFile);
        }
      }
    } catch (err) {
      // Rollback: Font-Row entfernen, hochgeladene Dateien löschen.
      await supabase.from("brand_fonts").delete().eq("id", newFont.id);
      for (const file of uploadedFiles) {
        await supabase.storage.from(STORAGE_BUCKET).remove([file.storage_path]);
      }
      throw err;
    }

    setFonts((prev) => [...prev, newFont]);
    setFiles((prev) => [...prev, ...uploadedFiles]);
  };

  const toggleFontRole = async (font: BrandFont, roleKey: string) => {
    const hasRole = font.roles.includes(roleKey);
    const nextRoles = hasRole
      ? font.roles.filter((r) => r !== roleKey)
      : [...font.roles, roleKey];
    // Reihenfolge nach FONT_ROLES beibehalten, damit die Chips stabil wirken.
    const order = FONT_ROLES.map((r) => r.key);
    nextRoles.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    setFonts((prev) =>
      prev.map((f) => (f.id === font.id ? { ...f, roles: nextRoles } : f))
    );

    const { error: updateError } = await supabase
      .from("brand_fonts")
      .update({ roles: nextRoles })
      .eq("id", font.id);
    if (updateError) {
      setError(updateError.message);
      setFonts((prev) =>
        prev.map((f) => (f.id === font.id ? { ...f, roles: font.roles } : f))
      );
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const fetchFileBlob = async (path: string): Promise<ArrayBuffer> => {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const response = await fetch(data.publicUrl);
    if (!response.ok) {
      throw new Error(
        `Datei konnte nicht geladen werden (${response.status}).`
      );
    }
    return response.arrayBuffer();
  };

  const downloadAllFiles = async (font: BrandFont) => {
    if (downloadingFontId) return;
    const fontFiles = filesByFont.get(font.id) ?? [];
    if (fontFiles.length === 0) return;
    setDownloadingFontId(font.id);
    setError(null);
    try {
      const zip = new JSZip();
      const familySlug = sanitizeSegment(font.family);
      for (const file of fontFiles) {
        const buffer = await fetchFileBlob(file.storage_path);
        const fileName = `${file.format.toUpperCase()}/${familySlug}-${file.variant}.${file.format}`;
        zip.file(fileName, buffer);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `${familySlug}-fonts.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingFontId(null);
    }
  };

  const convertToWoff2 = async (
    font: BrandFont
  ): Promise<{ ok: boolean; created: BrandFontFile[] }> => {
    if (convertingFontId) return { ok: false, created: [] };
    const fontFiles = filesByFont.get(font.id) ?? [];
    // Pro (weight, italic) pruefen, ob schon eine woff2 existiert, sonst
    // eine passende Quelle (ttf bevorzugt, sonst otf) konvertieren.
    type Source = { file: BrandFontFile };
    const needed = new Map<string, Source>();
    for (const file of fontFiles) {
      const key = `${file.weight}-${file.italic ? 1 : 0}`;
      const hasWoff2 = fontFiles.some(
        (f) => f.weight === file.weight && f.italic === file.italic && f.format === "woff2"
      );
      if (hasWoff2) continue;
      const current = needed.get(key);
      // ttf bevorzugt, sonst otf (wawoff2 kann beides, da beide SFNT sind).
      const prio: Record<string, number> = { ttf: 0, otf: 1, woff: 99, eot: 99 };
      const fPrio = prio[file.format] ?? 100;
      const cPrio = current ? (prio[current.file.format] ?? 100) : 101;
      if (fPrio < cPrio && (file.format === "ttf" || file.format === "otf")) {
        needed.set(key, { file });
      }
    }

    if (needed.size === 0) {
      return { ok: true, created: [] };
    }

    setConvertingFontId(font.id);
    setError(null);
    setConvertProgress(null);
    const familySlug = sanitizeSegment(font.family);
    const created: BrandFontFile[] = [];

    try {
      const total = needed.size;
      let index = 0;
      for (const source of needed.values()) {
        index += 1;
        setConvertProgress(
          `Konvertiere ${source.file.style_label} (${index}/${total}) …`
        );

        const srcBuffer = await fetchFileBlob(source.file.storage_path);
        const response = await fetch("/api/fonts/convert", {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: srcBuffer,
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            data?.error ??
              `Konvertierung fehlgeschlagen (Status ${response.status}).`
          );
        }
        const woff2Buffer = await response.arrayBuffer();
        const variant = source.file.variant;
        const path = `${brandSlug}/fonts/${familySlug}/${font.id}/${variant}.woff2`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, new Uint8Array(woff2Buffer), {
            upsert: true,
            contentType: "font/woff2",
            cacheControl: "31536000",
          });
        if (uploadError) throw new Error(uploadError.message);

        const { data: fileRow, error: insertError } = await supabase
          .from("brand_font_files")
          .insert({
            font_id: font.id,
            variant,
            style_label: source.file.style_label,
            weight: source.file.weight,
            italic: source.file.italic,
            format: "woff2",
            storage_path: path,
            size_bytes: woff2Buffer.byteLength,
          })
          .select(
            "id, font_id, variant, style_label, weight, italic, format, storage_path, size_bytes"
          )
          .single();
        if (insertError) throw new Error(insertError.message);
        if (fileRow) created.push(fileRow as BrandFontFile);
      }

      if (created.length > 0) {
        setFiles((prev) => [...prev, ...created]);
      }
      return { ok: true, created };
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Konvertierung fehlgeschlagen."
      );
      return { ok: false, created };
    } finally {
      setConvertingFontId(null);
      setConvertProgress(null);
    }
  };

  const exportWebFont = async (font: BrandFont) => {
    if (exportingFontId) return;
    let fontFiles = filesByFont.get(font.id) ?? [];
    if (fontFiles.length === 0) return;

    // Wenn noch keine WOFF2-Dateien existieren, bieten wir eine automatische
    // Konvertierung aus TTF/OTF an.
    const hasWoff2 = fontFiles.some((f) => f.format === "woff2");
    const hasTtfOrOtf = fontFiles.some(
      (f) => f.format === "ttf" || f.format === "otf"
    );
    if (!hasWoff2) {
      if (!hasTtfOrOtf) {
        setError(
          "Fuer den Webexport werden WOFF2-Dateien benoetigt. Fuege eine TTF- oder OTF-Datei hinzu, um automatisch zu konvertieren."
        );
        return;
      }
      const confirmed = window.confirm(
        `Fuer den Webexport werden WOFF2-Dateien benoetigt. Sollen die vorhandenen TTF/OTF-Dateien von "${font.family}" automatisch zu WOFF2 konvertiert werden?`
      );
      if (!confirmed) return;
      const { ok, created } = await convertToWoff2(font);
      if (!ok) return;
      // setFiles ist asynchron. Wir arbeiten unten direkt mit dem Mergewert,
      // damit der Export nicht auf das naechste Render warten muss.
      fontFiles = [...fontFiles, ...created];
    }

    setExportingFontId(font.id);
    setError(null);
    try {
      const zip = new JSZip();
      const familySlug = sanitizeSegment(font.family);
      const root = zip.folder(`${familySlug}-web`);
      if (!root) throw new Error("ZIP konnte nicht erstellt werden.");

      // Webexport ist fuer Entwickler gedacht - ausschliesslich woff2.
      type Picked = {
        file: BrandFontFile;
        relPath: string;
      };
      const byVariant = new Map<string, BrandFontFile[]>();
      for (const file of fontFiles) {
        if (file.format !== "woff2") continue;
        const key = `${file.weight}-${file.italic ? 1 : 0}`;
        if (!byVariant.has(key)) byVariant.set(key, []);
        byVariant.get(key)!.push(file);
      }

      if (byVariant.size === 0) {
        throw new Error(
          "Fuer diese Schrift sind keine WOFF2-Dateien hinterlegt. Der Webexport benoetigt WOFF2."
        );
      }

      const picked: Picked[] = [];
      for (const [, list] of byVariant) {
        const best = list[0];
        const bestRel = `fonts/${familySlug}-${best.variant}.${best.format}`;
        picked.push({ file: best, relPath: bestRel });
      }

      for (const entry of picked) {
        const buffer = await fetchFileBlob(entry.file.storage_path);
        root.file(entry.relPath, buffer);
      }

      picked.sort((a, b) => {
        if (a.file.weight !== b.file.weight) {
          return a.file.weight - b.file.weight;
        }
        return Number(a.file.italic) - Number(b.file.italic);
      });

      const cssLines: string[] = [];
      cssLines.push(`/* ${font.family} – Webfont (WOFF2) */`);
      cssLines.push(
        `/* Einbindung: <link rel="stylesheet" href="${familySlug}.css"> */`
      );
      cssLines.push("");
      for (const entry of picked) {
        const file = entry.file;
        cssLines.push("@font-face {");
        cssLines.push(`  font-family: '${font.family}';`);
        cssLines.push(`  font-style: ${file.italic ? "italic" : "normal"};`);
        cssLines.push(`  font-weight: ${file.weight};`);
        cssLines.push(`  font-display: swap;`);
        cssLines.push(
          `  src: url('./${entry.relPath}') format('${cssFormatName(file.format)}');`
        );
        cssLines.push("}");
        cssLines.push("");
      }

      const cssContent = cssLines.join("\n");
      root.file(`${familySlug}.css`, cssContent);

      const readmeLines = [
        `# ${font.family} – Webfont-Export`,
        "",
        "## Inhalt",
        "",
        `- \`${familySlug}.css\` – @font-face-Deklarationen`,
        "- `fonts/` – WOFF2-Schriftdateien (fuer Webentwicklung)",
        "",
        "## Einbindung",
        "",
        "```html",
        `<link rel="stylesheet" href="${familySlug}.css">`,
        "```",
        "",
        "```css",
        `body {`,
        `  font-family: '${font.family}', sans-serif;`,
        `}`,
        "```",
        "",
      ];
      if (font.source === "custom") {
        readmeLines.push(
          "## Lizenz",
          "",
          "Diese Schrift wurde manuell hochgeladen. Stelle sicher, dass die",
          "Lizenzbedingungen der Schrift die Verwendung als Webfont abdecken,",
          "bevor du diesen Export ausrollst.",
          ""
        );
      } else {
        readmeLines.push(
          "## Lizenz",
          "",
          "Google Fonts stehen unter einer freien Lizenz (meist SIL Open Font",
          "License oder Apache 2.0). Details:",
          `https://fonts.google.com/specimen/${encodeURIComponent(font.family)}/about`,
          ""
        );
      }
      root.file("README.md", readmeLines.join("\n"));

      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `${familySlug}-webfont.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportingFontId(null);
    }
  };

  const handleDelete = async () => {
    if (!fontToDelete) return;
    setDeleting(true);
    setError(null);
    const fontFiles = filesByFont.get(fontToDelete.id) ?? [];
    const paths = fontFiles.map((f) => f.storage_path);
    const { error: deleteError } = await supabase
      .from("brand_fonts")
      .delete()
      .eq("id", fontToDelete.id);
    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }
    if (paths.length > 0) {
      await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    }
    const removedId = fontToDelete.id;
    setFonts((prev) => prev.filter((f) => f.id !== removedId));
    setFiles((prev) => prev.filter((f) => f.font_id !== removedId));
    setFontToDelete(null);
    setDeleting(false);
  };

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Fehler: {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-black">
            Schriften
          </h3>
          <p className="mt-1 text-sm text-black/60">
            Suche Schriften bei Google Fonts (WOFF2 + TTF) oder lade eigene
            Schriftdateien hoch. TTF/OTF-Uploads koennen mit einem Klick zu
            WOFF2 konvertiert werden. Der Webexport enthaelt das fertige
            @font-face-Paket, der ZIP-Download alle hinterlegten Formate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-black/85"
        >
          <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M6 2v8M2 6h8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Schrift hinzufuegen
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-black/50">Lade Schriften …</p>
      ) : fonts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/15 bg-white p-10 text-center">
          <p className="text-sm text-black/60">
            Noch keine Schrift hinterlegt. Klicke auf „Schrift hinzufuegen“, um
            zu starten.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {fonts.map((font) => {
            const fontFiles = filesByFont.get(font.id) ?? [];
            const filesByFormat = new Map<string, BrandFontFile[]>();
            for (const file of fontFiles) {
              if (!filesByFormat.has(file.format)) {
                filesByFormat.set(file.format, []);
              }
              filesByFormat.get(file.format)!.push(file);
            }
            const uniqueVariantsByWeight = new Map<number, BrandFontFile[]>();
            for (const file of fontFiles) {
              if (!uniqueVariantsByWeight.has(file.weight)) {
                uniqueVariantsByWeight.set(file.weight, []);
              }
              uniqueVariantsByWeight.get(file.weight)!.push(file);
            }
            // Pro weight+italic nur einmal (nach format-Prio).
            const previewList: BrandFontFile[] = [];
            const seen = new Set<string>();
            for (const file of fontFiles) {
              const key = `${file.weight}-${file.italic ? 1 : 0}`;
              if (seen.has(key)) continue;
              seen.add(key);
              previewList.push(file);
            }
            previewList.sort((a, b) => {
              if (a.weight !== b.weight) return a.weight - b.weight;
              return Number(a.italic) - Number(b.italic);
            });

            const cssFamily = cssFamilyName(font);

            const isCollapsed = collapsed[font.id] !== false;
            const isDownloading = downloadingFontId === font.id;
            const isExporting = exportingFontId === font.id;
            const isConverting = convertingFontId === font.id;
            const hasWoff2 = fontFiles.some((f) => f.format === "woff2");
            const hasConvertibleSource = fontFiles.some(
              (f) => f.format === "ttf" || f.format === "otf"
            );
            const canConvert = !hasWoff2 && hasConvertibleSource;

            return (
              <article
                key={font.id}
                className="flex flex-col gap-5 rounded-2xl border border-black/10 bg-white p-6"
              >
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(font.id)}
                      aria-label={isCollapsed ? "Eintrag ausklappen" : "Eintrag einklappen"}
                      aria-expanded={!isCollapsed}
                      className="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-md text-black/50 transition hover:bg-black/5 hover:text-black"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                        style={{
                          transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          transition: "transform 150ms ease-out",
                        }}
                      >
                        <path
                          d="M3 5l3 3 3-3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className="text-lg font-semibold text-black"
                          style={{
                            fontFamily: `'${cssFamily}', ui-sans-serif, system-ui, sans-serif`,
                          }}
                        >
                          {font.family}
                        </h4>
                        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-black/60">
                          {font.source === "google" ? "Google Fonts" : "Eigene Datei"}
                        </span>
                        <span className="text-[11px] uppercase tracking-widest text-black/40">
                          {fontFiles.length}{" "}
                          {fontFiles.length === 1 ? "Datei" : "Dateien"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {font.google_category && (
                          <span className="text-[11px] uppercase tracking-widest text-black/40">
                            {font.google_category}
                          </span>
                        )}
                        {font.roles.length > 0 ? (
                          font.roles.map((roleKey) => (
                            <span
                              key={`${font.id}-role-chip-${roleKey}`}
                              className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white"
                            >
                              {ROLE_LABEL_BY_KEY[roleKey] ?? roleKey}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] italic text-black/40">
                            Keine Verwendung zugewiesen
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadAllFiles(font)}
                      disabled={fontFiles.length === 0 || isDownloading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black/80 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                        <path
                          d="M6 1v7m0 0L3.5 5.5M6 8l2.5-2.5M2 10h8"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                      {isDownloading ? "Packe ZIP …" : "Alle Schnitte (ZIP)"}
                    </button>
                    {canConvert && (
                      <button
                        type="button"
                        onClick={() => convertToWoff2(font)}
                        disabled={isConverting}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black/80 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
                        title="TTF/OTF-Dateien zu WOFF2 konvertieren"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          aria-hidden
                        >
                          <path
                            d="M2 4.5a4 4 0 0 1 7-1.5M10 7.5a4 4 0 0 1-7 1.5M9 2v2.5H6.5M3 10V7.5H5.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </svg>
                        {isConverting
                          ? convertProgress ?? "Konvertiere …"
                          : "Zu WOFF2 konvertieren"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => exportWebFont(font)}
                      disabled={
                        fontFiles.length === 0 || isExporting || isConverting
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white transition enabled:hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Webfont-Paket mit @font-face CSS und Dateien herunterladen"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                        <path
                          d="M1.5 3h9M1.5 6h9M1.5 9h5M8.5 7.5v3M7 9h3"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                      {isExporting ? "Erstelle Webexport …" : "Webexport"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontToDelete(font)}
                      className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-red-50 hover:text-red-700"
                    >
                      Entfernen
                    </button>
                  </div>
                </header>

                <div
                  className="grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out"
                  style={{
                    gridTemplateRows: isCollapsed ? "0fr" : "1fr",
                  }}
                >
                  <div className="min-h-0">
                    <div className="flex flex-col gap-5">
                <div className="rounded-xl border border-black/5 bg-black/[0.015] p-6">
                  <div
                    className="flex flex-wrap items-baseline gap-x-4"
                    style={{ fontFamily: `'${cssFamily}', sans-serif` }}
                  >
                    <span
                      style={{
                        fontFamily: `'${cssFamily}', sans-serif`,
                        fontSize: "3rem",
                        lineHeight: 1,
                        fontWeight: 700,
                      }}
                    >
                      Aa
                    </span>
                    <span
                      style={{
                        fontFamily: `'${cssFamily}', sans-serif`,
                        fontSize: "3rem",
                        lineHeight: 1,
                        fontWeight: 500,
                      }}
                    >
                      Bb
                    </span>
                    <span
                      style={{
                        fontFamily: `'${cssFamily}', sans-serif`,
                        fontSize: "3rem",
                        lineHeight: 1,
                        fontWeight: 400,
                      }}
                    >
                      Cc
                    </span>
                  </div>
                  <div className="mt-4 flex flex-col gap-1">
                    {previewList.map((file) => (
                      <p
                        key={`${file.font_id}-${file.variant}-preview`}
                        className="text-2xl leading-tight text-black"
                        style={{
                          fontFamily: `'${cssFamily}', sans-serif`,
                          fontWeight: file.weight,
                          fontStyle: file.italic ? "italic" : "normal",
                        }}
                      >
                        {font.family} {file.style_label}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <h5 className="text-xs font-semibold uppercase tracking-widest text-black/50">
                    Verwendung
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {FONT_ROLES.map((role) => {
                      const active = font.roles.includes(role.key);
                      return (
                        <button
                          key={`${font.id}-role-${role.key}`}
                          type="button"
                          onClick={() => toggleFontRole(font, role.key)}
                          aria-pressed={active}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            active
                              ? "border-black bg-black text-white"
                              : "border-black/15 bg-white text-black/70 hover:bg-black/5"
                          }`}
                        >
                          {role.label}
                        </button>
                      );
                    })}
                  </div>

                  {font.roles.length > 0 && fontFiles.length > 0 && (
                    <div className="flex flex-col gap-3 rounded-xl border border-black/5 bg-black/[0.015] p-4">
                      {FONT_ROLES.filter((role) =>
                        font.roles.includes(role.key)
                      ).map((role) => (
                        <div
                          key={`${font.id}-role-preview-${role.key}`}
                          className="flex items-baseline justify-between gap-4"
                        >
                          <span className="flex-none text-[10px] font-semibold uppercase tracking-widest text-black/40">
                            {role.label}
                          </span>
                          <span
                            className="min-w-0 truncate text-black"
                            style={{
                              fontFamily: `'${cssFamily}', sans-serif`,
                              fontSize: role.previewSize,
                              fontWeight: role.previewWeight,
                              lineHeight: 1.2,
                              letterSpacing:
                                role.key === "overline" ? "0.15em" : undefined,
                              textTransform:
                                role.key === "overline" ? "uppercase" : undefined,
                              fontStyle:
                                role.key === "quote" ? "italic" : undefined,
                            }}
                          >
                            {role.key === "monospace"
                              ? "const hello = 'world';"
                              : role.key === "overline"
                                ? font.family
                                : `${font.family} – ${role.label}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <h5 className="text-xs font-semibold uppercase tracking-widest text-black/50">
                    Hinterlegte Dateien
                  </h5>
                  {fontFiles.length === 0 ? (
                    <p className="text-sm text-black/50">
                      Noch keine Schriftdateien vorhanden.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {Array.from(filesByFormat.entries())
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([format, list]) => (
                          <section
                            key={`${font.id}-${format}`}
                            className="flex flex-col gap-2"
                          >
                            <header className="flex items-center gap-2">
                              <span className="rounded-md bg-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white">
                                {formatLabel(format)}
                              </span>
                              <span className="text-[11px] uppercase tracking-widest text-black/40">
                                {list.length}{" "}
                                {list.length === 1 ? "Datei" : "Dateien"}
                              </span>
                            </header>
                            <ul className="divide-y divide-black/5 rounded-xl border border-black/10">
                              {list
                                .slice()
                                .sort((a, b) => {
                                  if (a.weight !== b.weight)
                                    return a.weight - b.weight;
                                  return (
                                    Number(a.italic) - Number(b.italic)
                                  );
                                })
                                .map((file) => {
                                  const { data } = supabase.storage
                                    .from(STORAGE_BUCKET)
                                    .getPublicUrl(file.storage_path);
                                  const downloadUrl = data.publicUrl;
                                  return (
                                    <li
                                      key={file.id}
                                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium text-black">
                                          {file.style_label}
                                        </span>
                                        <span className="text-[11px] uppercase tracking-widest text-black/40">
                                          {font.family}-{file.variant}.
                                          {file.format} ·{" "}
                                          {formatBytes(file.size_bytes)}
                                        </span>
                                      </div>
                                      {downloadUrl && (
                                        <a
                                          href={downloadUrl}
                                          download={`${sanitizeSegment(font.family)}-${file.variant}.${file.format}`}
                                          className="rounded-md border border-black/15 px-2 py-1 text-xs font-medium text-black/70 hover:bg-black/5 hover:text-black"
                                        >
                                          Download
                                        </a>
                                      )}
                                    </li>
                                  );
                                })}
                            </ul>
                          </section>
                        ))}
                    </div>
                  )}
                </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AddFontModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleSubmitAdd}
        existingFamilies={fonts.map((f) => f.family)}
      />

      <ConfirmDialog
        open={fontToDelete !== null}
        title="Schrift entfernen?"
        description={
          fontToDelete
            ? `Die Schrift „${fontToDelete.family}“ und alle zugehoerigen Dateien werden entfernt.`
            : undefined
        }
        confirmLabel="Entfernen"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) setFontToDelete(null);
        }}
      />
    </div>
  );
}
