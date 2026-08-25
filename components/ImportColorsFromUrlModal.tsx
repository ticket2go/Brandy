"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { formatRgb, hexToRgb } from "@/lib/color";
import { normalizeWebsiteUrl } from "@/lib/websiteUrl";

import Modal from "./Modal";

type ExtractedColor = {
  hex: string;
  count: number;
  sources: string[];
};

export type ImportColorItem = {
  hex: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: (colors: ImportColorItem[]) => Promise<void>;
};

type RowState = {
  selected: boolean;
  name: string;
};

function defaultNameFor(hex: string, index: number): string {
  return `Webfarbe ${index + 1} (${hex.toUpperCase()})`;
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b)
  );
}

export default function ImportColorsFromUrlModal({
  open,
  onClose,
  onImport,
}: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ExtractedColor[] | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [hideNeutrals, setHideNeutrals] = useState(false);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setLoading(false);
      setImporting(false);
      setError(null);
      setResults(null);
      setRowState({});
      setHideNeutrals(false);
    }
  }, [open]);

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (!hideNeutrals) return results;
    return results.filter((c) => {
      const l = luminance(c.hex);
      return l > 0.02 && l < 0.98;
    });
  }, [results, hideNeutrals]);

  const selectedCount = useMemo(
    () =>
      filteredResults.filter((c) => rowState[c.hex]?.selected).length,
    [filteredResults, rowState]
  );

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || importing) return;
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Bitte eine URL angeben.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const normalized = normalizeWebsiteUrl(trimmed);
      const response = await fetch("/api/extract-colors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const data = (await response.json().catch(() => null)) as
        | { colors?: ExtractedColor[]; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }
      const colors = data?.colors ?? [];
      setResults(colors);
      const next: Record<string, RowState> = {};
      colors.forEach((c, idx) => {
        next[c.hex] = {
          selected: false,
          name: defaultNameFor(c.hex, idx),
        };
      });
      setRowState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (hex: string) => {
    setRowState((prev) => ({
      ...prev,
      [hex]: {
        ...(prev[hex] ?? { selected: false, name: "" }),
        selected: !(prev[hex]?.selected ?? false),
      },
    }));
  };

  const setRowName = (hex: string, name: string) => {
    setRowState((prev) => ({
      ...prev,
      [hex]: {
        ...(prev[hex] ?? { selected: false, name: "" }),
        name,
      },
    }));
  };

  const selectAllVisible = () => {
    setRowState((prev) => {
      const next = { ...prev };
      for (const c of filteredResults) {
        next[c.hex] = {
          ...(next[c.hex] ?? { selected: false, name: defaultNameFor(c.hex, 0) }),
          selected: true,
        };
      }
      return next;
    });
  };

  const deselectAll = () => {
    setRowState((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], selected: false };
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (importing || loading) return;
    const selected: ImportColorItem[] = filteredResults
      .filter((c) => rowState[c.hex]?.selected)
      .map((c) => ({
        hex: c.hex,
        name: (rowState[c.hex]?.name || defaultNameFor(c.hex, 0)).trim(),
      }))
      .filter((c) => c.name.length > 0);

    if (selected.length === 0) {
      setError("Bitte mindestens eine Farbe auswaehlen.");
      return;
    }

    setImporting(true);
    setError(null);
    try {
      await onImport(selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading && !importing) onClose();
      }}
      title="Farben aus Website importieren"
      description="Fuege eine URL ein. Wir lesen die CSS-Dateien der Seite und schlagen gefundene Farben vor."
      widthClassName="max-w-2xl"
    >
      <form
        onSubmit={handleGenerate}
        noValidate
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1 text-sm text-black/70">
          Website oder Domain
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="example.com"
              disabled={loading || importing}
              className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            />
            <button
              type="submit"
              disabled={loading || importing || !url.trim()}
              className="shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Lese …" : "Farben generieren"}
            </button>
          </div>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            Fehler: {error}
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-black/60">
            <span
              className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black"
              aria-hidden
            />
            Farben werden aus der Seite extrahiert …
          </div>
        )}

        {results && !loading && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-black/60">
              <span>
                {results.length} Farben gefunden
                {hideNeutrals && results.length !== filteredResults.length
                  ? ` (${filteredResults.length} sichtbar)`
                  : ""}
                · {selectedCount} ausgewaehlt
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={hideNeutrals}
                    onChange={(event) => setHideNeutrals(event.target.checked)}
                  />
                  Schwarz/Weiss ausblenden
                </label>
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="rounded-md border border-black/15 bg-white px-2 py-1 text-[11px] font-medium hover:bg-black/5"
                >
                  Alle
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="rounded-md border border-black/15 bg-white px-2 py-1 text-[11px] font-medium hover:bg-black/5"
                >
                  Keine
                </button>
              </div>
            </div>

            {filteredResults.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-3 py-6 text-center text-sm text-black/50">
                Keine Farben gefunden. Vielleicht laedt die Seite ihr CSS erst
                per JavaScript – probiere eine andere Ziel-URL.
              </p>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-black/10">
                <ul className="divide-y divide-black/5">
                  {filteredResults.map((c) => {
                    const state = rowState[c.hex];
                    const rgb = hexToRgb(c.hex);
                    return (
                      <li
                        key={c.hex}
                        className={`flex items-center gap-3 px-3 py-2 transition ${state?.selected ? "bg-black/[0.04]" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={state?.selected ?? false}
                          onChange={() => toggleRow(c.hex)}
                          aria-label={`Farbe ${c.hex} auswaehlen`}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-black"
                        />
                        <span
                          aria-hidden
                          className="h-10 w-10 shrink-0 rounded-lg border border-black/10"
                          style={{ backgroundColor: c.hex }}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <input
                            type="text"
                            value={state?.name ?? ""}
                            onChange={(event) =>
                              setRowName(c.hex, event.target.value)
                            }
                            placeholder={`Farbname (${c.hex})`}
                            className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-sm text-black outline-none focus:border-black/20 focus:bg-white"
                          />
                          <span className="px-1 text-[11px] font-mono text-black/50">
                            {c.hex}
                            {rgb ? ` · ${formatRgb(rgb)}` : ""}
                            {c.count > 1 ? ` · ${c.count}x` : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading || importing}
            className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-black/5 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={
              loading ||
              importing ||
              !results ||
              selectedCount === 0
            }
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing
              ? "Importiert …"
              : selectedCount > 0
                ? `${selectedCount} Farben hinzufuegen`
                : "Ausgewaehlte hinzufuegen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
