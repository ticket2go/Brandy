"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "./Modal";
import {
  formatFromFilename,
  formatLabel,
  normalizeFontFormat,
} from "@/lib/fontFormat";

type GoogleVariant = {
  variant: string;
  weight: number;
  italic: boolean;
  styleLabel: string;
};

type GoogleFamily = {
  family: string;
  category: string;
  variants: GoogleVariant[];
};

type GoogleFileResult = {
  variant: string;
  weight: number;
  italic: boolean;
  styleLabel: string;
  format: string;
  contentType: string;
  base64: string;
};

type CustomEntry = {
  id: string;
  file: File;
  format: string;
  weight: number;
  italic: boolean;
  styleLabel: string;
};

export type AddFontSubmitGoogle = {
  source: "google";
  family: string;
  category: string | null;
  licenseConfirmed: boolean;
  files: Array<{
    variant: string;
    styleLabel: string;
    weight: number;
    italic: boolean;
    format: string;
    data: Uint8Array;
    contentType: string;
    size: number;
  }>;
};

export type AddFontSubmitCustom = {
  source: "custom";
  family: string;
  licenseConfirmed: boolean;
  files: Array<{
    variant: string;
    styleLabel: string;
    weight: number;
    italic: boolean;
    format: string;
    file: File;
  }>;
};

export type AddFontSubmit = AddFontSubmitGoogle | AddFontSubmitCustom;

type AddFontModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: AddFontSubmit) => Promise<void>;
  existingFamilies: string[];
};

const WEIGHT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 100, label: "100 Thin" },
  { value: 200, label: "200 Extra Light" },
  { value: 300, label: "300 Light" },
  { value: 400, label: "400 Regular" },
  { value: 500, label: "500 Medium" },
  { value: 600, label: "600 Semi Bold" },
  { value: 700, label: "700 Bold" },
  { value: 800, label: "800 Extra Bold" },
  { value: 900, label: "900 Black" },
];

function styleLabel(weight: number, italic: boolean): string {
  const entry = WEIGHT_OPTIONS.find((o) => o.value === weight);
  const base = entry ? entry.label.split(" ").slice(1).join(" ") : String(weight);
  if (!italic) return base;
  if (weight === 400) return "Italic";
  return `${base} Italic`;
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const length = binary.length;
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  // Fallback (sollte im Browser nicht gebraucht werden)
  return new Uint8Array();
}

export default function AddFontModal({
  open,
  onClose,
  onSubmit,
  existingFamilies,
}: AddFontModalProps) {
  const [mode, setMode] = useState<"google" | "custom">("google");

  // Google state
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<GoogleFamily[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<GoogleFamily | null>(
    null
  );
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(
    new Set()
  );

  // Custom state
  const [customFamily, setCustomFamily] = useState("");
  const [customEntries, setCustomEntries] = useState<CustomEntry[]>([]);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const [licenseConfirmed, setLicenseConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const resetAll = useCallback(() => {
    setMode("google");
    setQuery("");
    setSearching(false);
    setSearchError(null);
    setResults([]);
    setSelectedFamily(null);
    setSelectedVariants(new Set());
    setCustomFamily("");
    setCustomEntries([]);
    setLicenseConfirmed(false);
    setSubmitting(false);
    setSubmitError(null);
    setProgressMessage(null);
  }, []);

  useEffect(() => {
    if (!open) resetAll();
  }, [open, resetAll]);

  // Live-Suche gegen API
  useEffect(() => {
    if (mode !== "google") return;
    const trimmed = query.trim();
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const response = await fetch(
          `/api/google-fonts/search?q=${encodeURIComponent(trimmed)}&limit=20`
        );
        const data = (await response.json()) as {
          results?: GoogleFamily[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setSearchError(data.error ?? "Suche fehlgeschlagen.");
          setResults([]);
        } else {
          setResults(data.results ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setSearchError(
            err instanceof Error ? err.message : "Suche fehlgeschlagen."
          );
          setResults([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, mode]);

  const existingFamilyLower = useMemo(
    () => new Set(existingFamilies.map((f) => f.toLowerCase())),
    [existingFamilies]
  );

  const handleSelectFamily = (family: GoogleFamily) => {
    setSelectedFamily(family);
    const defaultVariant = family.variants.find(
      (v) => v.weight === 400 && !v.italic
    );
    setSelectedVariants(
      new Set(defaultVariant ? [defaultVariant.variant] : [])
    );
  };

  const toggleVariant = (variant: string) => {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variant)) next.delete(variant);
      else next.add(variant);
      return next;
    });
  };

  const handleCustomFiles = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const newEntries: CustomEntry[] = [];
    for (let i = 0; i < filesList.length; i += 1) {
      const file = filesList[i];
      const format = formatFromFilename(file.name);
      if (!format) continue;
      const lowerName = file.name.toLowerCase();
      let guessedWeight = 400;
      for (const opt of WEIGHT_OPTIONS) {
        const label = opt.label.split(" ").slice(1).join("").toLowerCase();
        if (label && lowerName.includes(label)) guessedWeight = opt.value;
      }
      if (/(^|[^0-9])100([^0-9]|$)/.test(lowerName)) guessedWeight = 100;
      if (/(^|[^0-9])900([^0-9]|$)/.test(lowerName)) guessedWeight = 900;
      const italic = /italic|oblique/.test(lowerName);
      newEntries.push({
        id: `${file.name}-${file.size}-${Date.now()}-${i}`,
        file,
        format,
        weight: guessedWeight,
        italic,
        styleLabel: styleLabel(guessedWeight, italic),
      });
    }
    if (newEntries.length === 0) {
      setSubmitError(
        "Bitte nur Schriftdateien (woff2, woff, ttf, otf, eot) hochladen."
      );
      return;
    }
    setSubmitError(null);
    setCustomEntries((prev) => [...prev, ...newEntries]);
  };

  const updateCustomEntry = (id: string, patch: Partial<CustomEntry>) => {
    setCustomEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const next = { ...entry, ...patch };
        next.styleLabel = styleLabel(next.weight, next.italic);
        return next;
      })
    );
  };

  const removeCustomEntry = (id: string) => {
    setCustomEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (mode === "google") {
      return selectedFamily !== null && selectedVariants.size > 0;
    }
    if (!licenseConfirmed) return false;
    return customFamily.trim().length > 0 && customEntries.length > 0;
  }, [
    submitting,
    licenseConfirmed,
    mode,
    selectedFamily,
    selectedVariants,
    customFamily,
    customEntries,
  ]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    setProgressMessage(null);
    try {
      if (mode === "google") {
        if (!selectedFamily) return;
        if (existingFamilyLower.has(selectedFamily.family.toLowerCase())) {
          setSubmitError(
            `Die Schrift "${selectedFamily.family}" ist bereits hinterlegt.`
          );
          setSubmitting(false);
          return;
        }
        setProgressMessage("Lade Schriftdateien von Google Fonts …");
        const response = await fetch("/api/google-fonts/download", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            family: selectedFamily.family,
            variants: Array.from(selectedVariants),
          }),
        });
        const data = (await response.json()) as {
          family?: string;
          category?: string | null;
          files?: GoogleFileResult[];
          error?: string;
        };
        if (!response.ok || !data.files) {
          throw new Error(data.error ?? "Download fehlgeschlagen.");
        }
        const payload: AddFontSubmitGoogle = {
          source: "google",
          family: data.family ?? selectedFamily.family,
          category: data.category ?? selectedFamily.category ?? null,
          // Google Fonts stehen unter einer freien Lizenz (meist OFL/Apache),
          // daher implizit bestaetigt - kein zusaetzlicher Haken noetig.
          licenseConfirmed: true,
          files: data.files.map((f) => {
            const bytes = base64ToUint8Array(f.base64);
            return {
              variant: f.variant,
              styleLabel: f.styleLabel,
              weight: f.weight,
              italic: f.italic,
              format: normalizeFontFormat(f.format) ?? f.format,
              data: bytes,
              contentType: f.contentType,
              size: bytes.byteLength,
            };
          }),
        };
        setProgressMessage("Speichere Schriftdateien …");
        await onSubmit(payload);
      } else {
        const trimmedFamily = customFamily.trim();
        if (existingFamilyLower.has(trimmedFamily.toLowerCase())) {
          setSubmitError(
            `Die Schrift "${trimmedFamily}" ist bereits hinterlegt.`
          );
          setSubmitting(false);
          return;
        }
        setProgressMessage("Lade Schriftdateien hoch …");
        const payload: AddFontSubmitCustom = {
          source: "custom",
          family: trimmedFamily,
          licenseConfirmed: true,
          files: customEntries.map((entry) => ({
            variant: `${entry.weight}${entry.italic ? "italic" : ""}`,
            styleLabel: entry.styleLabel,
            weight: entry.weight,
            italic: entry.italic,
            format: entry.format,
            file: entry.file,
          })),
        };
        await onSubmit(payload);
      }
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Hinzufuegen fehlgeschlagen."
      );
    } finally {
      setSubmitting(false);
      setProgressMessage(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Schrift hinzufuegen"
      description="Suche eine Schrift bei Google Fonts oder lade eigene Schriftdateien hoch."
      widthClassName="max-w-2xl"
    >
      <div className="flex flex-col gap-5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("google")}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              mode === "google"
                ? "border-black bg-black text-white"
                : "border-black/15 bg-white text-black hover:bg-black/5"
            }`}
          >
            Google Fonts
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              mode === "custom"
                ? "border-black bg-black text-white"
                : "border-black/15 bg-white text-black hover:bg-black/5"
            }`}
          >
            Eigene Schriftdatei
          </button>
        </div>

        {mode === "google" ? (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-widest text-black/50">
                Font-Name
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedFamily(null);
                }}
                placeholder="z.B. Roboto, Inter, Open Sans …"
                className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black"
              />
            </label>

            {searchError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {searchError}
              </p>
            )}

            {!selectedFamily && (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-black/10">
                {searching && (
                  <p className="px-3 py-2 text-xs text-black/50">Suche …</p>
                )}
                {!searching && results.length === 0 && (
                  <p className="px-3 py-2 text-xs text-black/50">
                    {query.trim()
                      ? "Keine Treffer bei Google Fonts. Lade die Datei selbst hoch (Tab „Eigene Schriftdatei“)."
                      : "Tippe einen Font-Namen ein, um zu suchen."}
                  </p>
                )}
                {!searching &&
                  results.map((family) => {
                    const already = existingFamilyLower.has(
                      family.family.toLowerCase()
                    );
                    return (
                      <button
                        key={family.family}
                        type="button"
                        disabled={already}
                        onClick={() => handleSelectFamily(family)}
                        className="flex w-full items-center justify-between border-b border-black/5 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="font-medium text-black">
                          {family.family}
                        </span>
                        <span className="text-xs uppercase tracking-widest text-black/40">
                          {already ? "schon hinzugefuegt" : family.category}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}

            {selectedFamily && (
              <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-black">
                      {selectedFamily.family}
                    </p>
                    <p className="text-xs uppercase tracking-widest text-black/40">
                      {selectedFamily.category}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFamily(null);
                      setSelectedVariants(new Set());
                    }}
                    className="text-xs uppercase tracking-widest text-black/50 hover:text-black"
                  >
                    Andere Schrift
                  </button>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-widest text-black/50">
                    Schriftschnitte
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {selectedFamily.variants.map((variant) => {
                      const checked = selectedVariants.has(variant.variant);
                      return (
                        <label
                          key={variant.variant}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                            checked
                              ? "border-black bg-black text-white"
                              : "border-black/15 bg-white text-black hover:bg-black/5"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-current"
                            checked={checked}
                            onChange={() => toggleVariant(variant.variant)}
                          />
                          <span>{variant.styleLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-widest text-black/50">
                Schriftfamilie
              </span>
              <input
                type="text"
                value={customFamily}
                onChange={(e) => setCustomFamily(e.target.value)}
                placeholder="z.B. Chillax"
                className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black"
              />
            </label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-black/50">
                  Schriftdateien
                </span>
                <button
                  type="button"
                  onClick={() => customInputRef.current?.click()}
                  className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-black/5"
                >
                  Dateien auswaehlen
                </button>
                <input
                  ref={customInputRef}
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf,.eot,font/woff2,font/woff,font/ttf,font/otf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleCustomFiles(e.target.files);
                    if (customInputRef.current) {
                      customInputRef.current.value = "";
                    }
                  }}
                />
              </div>
              {customEntries.length === 0 ? (
                <p className="rounded-xl border border-dashed border-black/15 px-3 py-4 text-center text-xs text-black/40">
                  Noch keine Schriftdateien ausgewaehlt. Unterstuetzt werden
                  woff2, woff, ttf, otf und eot.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {customEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-black/10 bg-white p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-black">
                          {entry.file.name}
                        </p>
                        <p className="text-[11px] uppercase tracking-widest text-black/40">
                          {formatLabel(entry.format)} ·{" "}
                          {(entry.file.size / 1024).toFixed(1)} KB
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            value={entry.weight}
                            onChange={(e) =>
                              updateCustomEntry(entry.id, {
                                weight: parseInt(e.target.value, 10),
                              })
                            }
                            className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs"
                          >
                            {WEIGHT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-xs text-black/70">
                            <input
                              type="checkbox"
                              checked={entry.italic}
                              onChange={(e) =>
                                updateCustomEntry(entry.id, {
                                  italic: e.target.checked,
                                })
                              }
                            />
                            Italic
                          </label>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCustomEntry(entry.id)}
                        aria-label="Datei entfernen"
                        className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black"
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
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {mode === "custom" ? (
          <label className="flex items-start gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={licenseConfirmed}
              onChange={(e) => setLicenseConfirmed(e.target.checked)}
            />
            <span className="text-black/80">
              Ich bestaetige, dass eine gueltige Lizenz fuer die Nutzung
              dieser Schrift(en) vorliegt oder die Schrift unter einer freien
              Lizenz (z.B. SIL Open Font License) steht.
            </span>
          </label>
        ) : (
          selectedFamily && (
            <p className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-xs text-black/60">
              Google Fonts sind unter einer freien Lizenz (Open Font License /
              Apache) verfuegbar und koennen direkt verwendet werden.
            </p>
          )
        )}

        {submitError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        )}
        {progressMessage && !submitError && (
          <p className="text-xs text-black/60">{progressMessage}</p>
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
            {submitting ? "Lege an …" : "Schrift hinzufuegen"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
