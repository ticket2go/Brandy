"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Modal from "./Modal";
import DropZone from "./DropZone";
import {
  guessLogoMeta,
  LOGO_COLOR_SPACE_LABELS,
  LOGO_FORMAT_LABELS,
  LOGO_POLARITY_LABELS,
  LOGO_VARIANT_LABELS,
  logoFormatFromFilename,
  type LogoColorSpace,
  type LogoFormat,
  type LogoPolarity,
  type LogoVariant,
} from "@/lib/logoDetect";

type PendingEntry = {
  id: string;
  file: File;
  fileName: string;
  format: LogoFormat;
  variant: LogoVariant | null;
  polarity: LogoPolarity | null;
  colorSpace: LogoColorSpace | null;
  autoVariant: boolean;
  autoPolarity: boolean;
  autoColorSpace: boolean;
};

export type AddLogoSubmit = {
  files: Array<{
    file: File;
    fileName: string;
    format: LogoFormat;
    variant: LogoVariant;
    polarity: LogoPolarity;
    colorSpace: LogoColorSpace;
  }>;
};

type AddLogoModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: AddLogoSubmit) => Promise<void>;
};

const VARIANT_OPTIONS: LogoVariant[] = [
  "bildmarke",
  "wortmarke",
  "wort-bildmarke",
];
const POLARITY_OPTIONS: LogoPolarity[] = ["positiv", "negativ"];
const COLOR_SPACE_OPTIONS: LogoColorSpace[] = ["cmyk", "rgb"];

const ACCEPT =
  ".eps,.jpg,.jpeg,.png,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf,application/postscript";

function makeEntry(file: File, index: number): PendingEntry | null {
  const format = logoFormatFromFilename(file.name);
  if (!format) return null;
  const guess = guessLogoMeta(file.name);
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${index}`,
    file,
    fileName: file.name,
    format,
    variant: guess.variant,
    polarity: guess.polarity,
    colorSpace: guess.colorSpace,
    autoVariant: guess.variant !== null,
    autoPolarity: guess.polarity !== null,
    autoColorSpace: guess.colorSpace !== null,
  };
}

export default function AddLogoModal({
  open,
  onClose,
  onSubmit,
}: AddLogoModalProps) {
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setEntries([]);
    setSubmitting(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    const accepted: PendingEntry[] = [];
    const rejected: string[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const entry = makeEntry(files[i], i);
      if (entry) accepted.push(entry);
      else rejected.push(files[i].name);
    }
    if (accepted.length > 0) {
      setEntries((prev) => [...prev, ...accepted]);
    }
    if (rejected.length > 0) {
      setError(
        `Nicht unterstuetzt: ${rejected.join(", ")}. Erlaubt sind EPS, JPG, PNG, SVG und PDF.`
      );
    }
  }, []);

  const updateEntry = (id: string, patch: Partial<PendingEntry>) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const totalMissing = useMemo(() => {
    return entries.reduce((sum, entry) => {
      let missing = 0;
      if (entry.variant === null) missing += 1;
      if (entry.polarity === null) missing += 1;
      if (entry.colorSpace === null) missing += 1;
      return sum + missing;
    }, 0);
  }, [entries]);

  const canSubmit =
    !submitting && entries.length > 0 && totalMissing === 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: AddLogoSubmit = {
        files: entries.map((entry) => ({
          file: entry.file,
          fileName: entry.fileName,
          format: entry.format,
          variant: entry.variant as LogoVariant,
          polarity: entry.polarity as LogoPolarity,
          colorSpace: entry.colorSpace as LogoColorSpace,
        })),
      };
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Logos hochladen"
      description="Lade EPS-, JPG-, PNG-, SVG- oder PDF-Dateien per Drag & Drop hoch. Nicht eindeutig benannte Logos bitte unten selbst zuordnen."
      widthClassName="max-w-3xl"
    >
      <div className="flex flex-col gap-5">
        <DropZone
          accept={ACCEPT}
          onFiles={addFiles}
          title="Logodateien hierher ziehen"
          description="EPS · JPG · PNG · SVG · PDF – Mehrfachauswahl moeglich"
          buttonLabel="Logos auswaehlen"
          disabled={submitting}
        />

        {entries.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-black/50">
                Zuordnung ({entries.length}{" "}
                {entries.length === 1 ? "Datei" : "Dateien"})
              </h4>
              {totalMissing > 0 && (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  {totalMissing} offene Zuordnung
                  {totalMissing === 1 ? "" : "en"}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-3">
              {entries.map((entry) => {
                const missingVariant = entry.variant === null;
                const missingPolarity = entry.polarity === null;
                const missingColorSpace = entry.colorSpace === null;
                const missingAny =
                  missingVariant || missingPolarity || missingColorSpace;
                return (
                  <li
                    key={entry.id}
                    className={`rounded-2xl border p-4 ${
                      missingAny
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-black">
                          {entry.fileName}
                        </p>
                        <p className="text-[11px] uppercase tracking-widest text-black/40">
                          {LOGO_FORMAT_LABELS[entry.format]} ·{" "}
                          {(entry.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        aria-label="Datei entfernen"
                        className="rounded-md p-1 text-black/40 transition hover:bg-black/5 hover:text-black"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M3 3l8 8M11 3l-8 8"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <MetaSelector
                        label="Markenart"
                        options={VARIANT_OPTIONS}
                        getLabel={(v) => LOGO_VARIANT_LABELS[v]}
                        value={entry.variant}
                        auto={entry.autoVariant && entry.variant !== null}
                        missing={missingVariant}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            variant: value,
                            autoVariant: false,
                          })
                        }
                      />
                      <MetaSelector
                        label="Polaritaet"
                        options={POLARITY_OPTIONS}
                        getLabel={(v) => LOGO_POLARITY_LABELS[v]}
                        value={entry.polarity}
                        auto={entry.autoPolarity && entry.polarity !== null}
                        missing={missingPolarity}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            polarity: value,
                            autoPolarity: false,
                          })
                        }
                      />
                      <MetaSelector
                        label="Farbraum"
                        options={COLOR_SPACE_OPTIONS}
                        getLabel={(v) => LOGO_COLOR_SPACE_LABELS[v]}
                        value={entry.colorSpace}
                        auto={
                          entry.autoColorSpace && entry.colorSpace !== null
                        }
                        missing={missingColorSpace}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            colorSpace: value,
                            autoColorSpace: false,
                          })
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5 disabled:opacity-60"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? "Lade hoch …"
              : entries.length === 0
                ? "Logos hinzufuegen"
                : `${entries.length} ${entries.length === 1 ? "Logo" : "Logos"} hochladen`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type MetaSelectorProps<T extends string> = {
  label: string;
  options: T[];
  getLabel: (value: T) => string;
  value: T | null;
  auto: boolean;
  missing: boolean;
  onChange: (value: T) => void;
};

function MetaSelector<T extends string>({
  label,
  options,
  getLabel,
  value,
  auto,
  missing,
  onChange,
}: MetaSelectorProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-black/50">
          {label}
        </span>
        {auto && (
          <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-black/50">
            auto
          </span>
        )}
        {missing && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-amber-800">
            bitte waehlen
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "border-black bg-black text-white"
                  : "border-black/15 bg-white text-black/70 hover:bg-black/5"
              }`}
            >
              {getLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
