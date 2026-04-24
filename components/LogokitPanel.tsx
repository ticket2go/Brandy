"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import JSZip from "jszip";

import { supabase } from "@/lib/supabase/client";
import {
  LOGO_COLOR_SPACE_LABELS,
  LOGO_FORMATS,
  LOGO_FORMAT_LABELS,
  LOGO_POLARITY_LABELS,
  LOGO_VARIANT_LABELS,
  mimeTypeForLogoFormat,
  type LogoColorSpace,
  type LogoFormat,
  type LogoPolarity,
  type LogoVariant,
} from "@/lib/logoDetect";
import { slugify } from "@/lib/slugify";

import AddLogoModal, { type AddLogoSubmit } from "./AddLogoModal";
import ConfirmDialog from "./ConfirmDialog";

const STORAGE_BUCKET = "brand-assets";

type BrandLogo = {
  id: string;
  brand_id: string;
  file_name: string;
  format: LogoFormat;
  variant: LogoVariant | null;
  polarity: LogoPolarity | null;
  color_space: LogoColorSpace | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  position: number;
};

type LogokitPanelProps = {
  brandId: string;
  brandSlug: string;
  brandName: string;
};

type VariantFilter = LogoVariant | "all";
type PolarityFilter = LogoPolarity | "all";
type ColorSpaceFilter = LogoColorSpace | "all";
type FormatFilter = LogoFormat | "all";

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isRasterOrVectorPreviewable(format: LogoFormat): boolean {
  return format === "png" || format === "jpg" || format === "svg";
}

export default function LogokitPanel({
  brandId,
  brandSlug,
  brandName,
}: LogokitPanelProps) {
  const [logos, setLogos] = useState<BrandLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [logoToDelete, setLogoToDelete] = useState<BrandLogo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const [variantFilter, setVariantFilter] = useState<VariantFilter>("all");
  const [polarityFilter, setPolarityFilter] = useState<PolarityFilter>("all");
  const [colorSpaceFilter, setColorSpaceFilter] =
    useState<ColorSpaceFilter>("all");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("brand_logos")
      .select(
        "id, brand_id, file_name, format, variant, polarity, color_space, storage_path, mime_type, size_bytes, position"
      )
      .eq("brand_id", brandId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (loadError) {
      setError(loadError.message);
      setLogos([]);
    } else {
      setLogos((data ?? []) as BrandLogo[]);
    }
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmitAdd = async (payload: AddLogoSubmit) => {
    const startPosition =
      (logos.reduce((max, l) => Math.max(max, l.position), -1) || 0) + 1;
    const uploadedPaths: string[] = [];
    const inserted: BrandLogo[] = [];

    try {
      for (let i = 0; i < payload.files.length; i += 1) {
        const entry = payload.files[i];
        const safeName = entry.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${brandSlug}/logos/${Date.now()}-${i}-${safeName}`;
        const contentType =
          entry.file.type || mimeTypeForLogoFormat(entry.format);

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, entry.file, {
            upsert: true,
            cacheControl: "31536000",
            contentType,
          });
        if (uploadError) throw new Error(uploadError.message);
        uploadedPaths.push(path);

        const { data: row, error: insertError } = await supabase
          .from("brand_logos")
          .insert({
            brand_id: brandId,
            file_name: entry.fileName,
            format: entry.format,
            variant: entry.variant,
            polarity: entry.polarity,
            color_space: entry.colorSpace,
            storage_path: path,
            mime_type: contentType,
            size_bytes: entry.file.size,
            position: startPosition + i,
          })
          .select(
            "id, brand_id, file_name, format, variant, polarity, color_space, storage_path, mime_type, size_bytes, position"
          )
          .single();
        if (insertError) throw new Error(insertError.message);
        if (row) inserted.push(row as BrandLogo);
      }
    } catch (err) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      }
      for (const row of inserted) {
        await supabase.from("brand_logos").delete().eq("id", row.id);
      }
      throw err;
    }

    setLogos((prev) => [...prev, ...inserted]);
  };

  const handleDelete = async () => {
    if (!logoToDelete) return;
    setDeleting(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from("brand_logos")
      .delete()
      .eq("id", logoToDelete.id);
    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([logoToDelete.storage_path]);
    setLogos((prev) => prev.filter((l) => l.id !== logoToDelete.id));
    setLogoToDelete(null);
    setDeleting(false);
  };

  const filteredLogos = useMemo(() => {
    return logos.filter((logo) => {
      if (variantFilter !== "all" && logo.variant !== variantFilter)
        return false;
      if (polarityFilter !== "all" && logo.polarity !== polarityFilter)
        return false;
      if (
        colorSpaceFilter !== "all" &&
        logo.color_space !== colorSpaceFilter
      )
        return false;
      if (formatFilter !== "all" && logo.format !== formatFilter) return false;
      return true;
    });
  }, [logos, variantFilter, polarityFilter, colorSpaceFilter, formatFilter]);

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

  const fetchLogoBuffer = async (path: string): Promise<ArrayBuffer> => {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const response = await fetch(data.publicUrl);
    if (!response.ok) {
      throw new Error(
        `Logo konnte nicht geladen werden (${response.status}).`
      );
    }
    return response.arrayBuffer();
  };

  const downloadAllAsZip = async () => {
    if (downloadingZip) return;
    const subject = filteredLogos.length > 0 ? filteredLogos : logos;
    if (subject.length === 0) return;
    setDownloadingZip(true);
    setError(null);
    try {
      const zip = new JSZip();
      const brandSegment = slugify(brandName);
      const root = zip.folder(`${brandSegment}-logos`);
      if (!root) throw new Error("ZIP konnte nicht erstellt werden.");

      const nameCounter = new Map<string, number>();
      for (const logo of subject) {
        const buffer = await fetchLogoBuffer(logo.storage_path);
        const parts: string[] = [brandSegment];
        if (logo.variant) parts.push(logo.variant);
        if (logo.polarity) parts.push(logo.polarity);
        if (logo.color_space) parts.push(logo.color_space);
        parts.push(logo.format.toUpperCase());
        const folder = parts.slice(1).join("/");
        const baseName = logo.file_name;
        const key = `${folder}/${baseName}`;
        const count = nameCounter.get(key) ?? 0;
        nameCounter.set(key, count + 1);
        const finalName =
          count === 0
            ? baseName
            : baseName.replace(/(\.[^.]+)?$/, (ext) => `-${count}${ext || ""}`);
        const relPath = folder ? `${folder}/${finalName}` : finalName;
        root.file(relPath, buffer);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `${brandSegment}-logos.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingZip(false);
    }
  };

  const logoDownloadUrl = (logo: BrandLogo): string => {
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(logo.storage_path);
    return data.publicUrl;
  };

  const counts = useMemo(() => {
    const byVariant = new Map<LogoVariant | "none", number>();
    const byPolarity = new Map<LogoPolarity | "none", number>();
    const byColorSpace = new Map<LogoColorSpace | "none", number>();
    const byFormat = new Map<LogoFormat, number>();
    for (const logo of logos) {
      const vKey = logo.variant ?? "none";
      byVariant.set(vKey, (byVariant.get(vKey) ?? 0) + 1);
      const pKey = logo.polarity ?? "none";
      byPolarity.set(pKey, (byPolarity.get(pKey) ?? 0) + 1);
      const cKey = logo.color_space ?? "none";
      byColorSpace.set(cKey, (byColorSpace.get(cKey) ?? 0) + 1);
      byFormat.set(logo.format, (byFormat.get(logo.format) ?? 0) + 1);
    }
    return { byVariant, byPolarity, byColorSpace, byFormat };
  }, [logos]);

  return (
    <div className="flex flex-col gap-6">
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
            Logos
          </h3>
          <p className="mt-1 text-sm text-black/60">
            Lade Logodateien in EPS, JPG, PNG, SVG oder PDF hoch. Nutze die
            Filter, um nach Markenart, Polaritaet oder Farbraum zu suchen.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadAllAsZip}
            disabled={logos.length === 0 || downloadingZip}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-black/80 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
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
            {downloadingZip
              ? "Packe ZIP …"
              : filteredLogos.length !== logos.length
                ? `Gefilterte als ZIP (${filteredLogos.length})`
                : "Alle als ZIP"}
          </button>
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
            Logos hinzufuegen
          </button>
        </div>
      </div>

      {logos.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-4">
          <FilterRow
            label="Markenart"
            value={variantFilter}
            onChange={setVariantFilter}
            options={[
              { value: "all", label: "Alle", count: logos.length },
              {
                value: "bildmarke",
                label: LOGO_VARIANT_LABELS.bildmarke,
                count: counts.byVariant.get("bildmarke") ?? 0,
              },
              {
                value: "wortmarke",
                label: LOGO_VARIANT_LABELS.wortmarke,
                count: counts.byVariant.get("wortmarke") ?? 0,
              },
              {
                value: "wort-bildmarke",
                label: LOGO_VARIANT_LABELS["wort-bildmarke"],
                count: counts.byVariant.get("wort-bildmarke") ?? 0,
              },
            ]}
          />
          <FilterRow
            label="Polaritaet"
            value={polarityFilter}
            onChange={setPolarityFilter}
            options={[
              { value: "all", label: "Alle", count: logos.length },
              {
                value: "positiv",
                label: LOGO_POLARITY_LABELS.positiv,
                count: counts.byPolarity.get("positiv") ?? 0,
              },
              {
                value: "negativ",
                label: LOGO_POLARITY_LABELS.negativ,
                count: counts.byPolarity.get("negativ") ?? 0,
              },
            ]}
          />
          <FilterRow
            label="Farbraum"
            value={colorSpaceFilter}
            onChange={setColorSpaceFilter}
            options={[
              { value: "all", label: "Alle", count: logos.length },
              {
                value: "cmyk",
                label: LOGO_COLOR_SPACE_LABELS.cmyk,
                count: counts.byColorSpace.get("cmyk") ?? 0,
              },
              {
                value: "rgb",
                label: LOGO_COLOR_SPACE_LABELS.rgb,
                count: counts.byColorSpace.get("rgb") ?? 0,
              },
            ]}
          />
          <FilterRow
            label="Format"
            value={formatFilter}
            onChange={setFormatFilter}
            options={[
              { value: "all", label: "Alle", count: logos.length },
              ...LOGO_FORMATS.map((fmt) => ({
                value: fmt,
                label: LOGO_FORMAT_LABELS[fmt],
                count: counts.byFormat.get(fmt) ?? 0,
              })),
            ]}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-black/50">Lade Logos …</p>
      ) : logos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/15 bg-white p-10 text-center">
          <p className="text-sm text-black/60">
            Noch keine Logos hinterlegt. Klicke auf „Logos hinzufuegen“, um zu
            starten.
          </p>
        </div>
      ) : filteredLogos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/15 bg-white p-10 text-center">
          <p className="text-sm text-black/60">
            Keine Logos passen zu dieser Filter-Auswahl.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLogos.map((logo) => (
            <LogoCard
              key={logo.id}
              logo={logo}
              downloadUrl={logoDownloadUrl(logo)}
              onDelete={() => setLogoToDelete(logo)}
            />
          ))}
        </div>
      )}

      <AddLogoModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleSubmitAdd}
      />

      <ConfirmDialog
        open={logoToDelete !== null}
        title="Logo entfernen?"
        description={
          logoToDelete
            ? `Die Datei „${logoToDelete.file_name}“ wird entfernt.`
            : undefined
        }
        confirmLabel="Entfernen"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) setLogoToDelete(null);
        }}
      />
    </div>
  );
}

type FilterOption<T extends string> = {
  value: T;
  label: string;
  count: number;
};

type FilterRowProps<T extends string> = {
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
};

function FilterRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: FilterRowProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-black/40">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.value === value;
          const isDisabled = option.value !== "all" && option.count === 0;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (!isDisabled) onChange(option.value);
              }}
              disabled={isDisabled}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-black bg-black text-white"
                  : "border-black/15 bg-white text-black/70 hover:bg-black/5"
              } ${isDisabled ? "cursor-not-allowed opacity-40 hover:bg-white" : ""}`}
            >
              <span>{option.label}</span>
              <span className="ml-1 text-[10px] opacity-60">
                ({option.count})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type LogoCardProps = {
  logo: BrandLogo;
  downloadUrl: string;
  onDelete: () => void;
};

function LogoCard({ logo, downloadUrl, onDelete }: LogoCardProps) {
  const isDark = logo.polarity === "negativ";
  const canPreview = isRasterOrVectorPreviewable(logo.format);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-white">
      <div
        className={`flex aspect-[4/3] items-center justify-center p-6 ${
          isDark ? "bg-black" : "bg-black/[0.025]"
        }`}
      >
        {canPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={downloadUrl}
            alt={logo.file_name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div
            className={`flex flex-col items-center justify-center gap-1 ${
              isDark ? "text-white/70" : "text-black/40"
            }`}
          >
            <span className="text-xs uppercase tracking-widest">
              {LOGO_FORMAT_LABELS[logo.format]}
            </span>
            <span className="text-[11px]">Vorschau nicht verfuegbar</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-black">
            {logo.file_name}
          </p>
          <p className="text-[11px] uppercase tracking-widest text-black/40">
            {LOGO_FORMAT_LABELS[logo.format]} · {formatBytes(logo.size_bytes)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {logo.variant && (
            <Pill>{LOGO_VARIANT_LABELS[logo.variant]}</Pill>
          )}
          {logo.polarity && (
            <Pill>{LOGO_POLARITY_LABELS[logo.polarity]}</Pill>
          )}
          {logo.color_space && (
            <Pill>{LOGO_COLOR_SPACE_LABELS[logo.color_space]}</Pill>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <a
            href={downloadUrl}
            download={logo.file_name}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black/80 transition hover:bg-black/5"
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
            Download
          </a>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-black/50 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            Entfernen
          </button>
        </div>
      </div>
    </article>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-black/70">
      {children}
    </span>
  );
}
