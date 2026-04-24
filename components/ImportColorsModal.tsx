"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  formatCmyk,
  formatRgb,
  hexToRgb,
  type Cmyk,
} from "@/lib/color";
import { parseCclibsFile, type CclibsColor } from "@/lib/parseCclibs";

import Modal from "./Modal";

type ExtractedColor = {
  hex: string;
  count: number;
  sources: string[];
};

export type ImportTarget = "print" | "digital";

export type ImportColorItem = {
  hex: string;
  name: string;
  target: ImportTarget;
  cmyk?: Cmyk;
  spot?: { book?: string; name: string };
  mode: "rgb" | "cmyk" | "lab" | "gray" | "spot";
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: (colors: ImportColorItem[]) => Promise<void>;
};

type RowState = {
  selected: boolean;
  name: string;
  target: ImportTarget;
};

type Tab = "url" | "file";

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

type PreparedRow = {
  key: string;
  hex: string;
  label: string;
  subtitle: string;
  defaultName: string;
  defaultTarget: ImportTarget;
  cmyk?: Cmyk;
  spot?: { book?: string; name: string };
  mode: ImportColorItem["mode"];
  count?: number;
  group?: string;
};

const ALL_GROUPS = "__ALL__";

function modeBadge(mode: ImportColorItem["mode"]): string {
  switch (mode) {
    case "cmyk":
      return "CMYK";
    case "spot":
      return "Spot";
    case "lab":
      return "LAB";
    case "gray":
      return "Gray";
    default:
      return "RGB";
  }
}

export default function ImportColorsModal({ open, onClose, onImport }: Props) {
  const [tab, setTab] = useState<Tab>("url");

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlResults, setUrlResults] = useState<ExtractedColor[] | null>(null);
  const [fileResults, setFileResults] = useState<CclibsColor[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [hideNeutrals, setHideNeutrals] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTab("url");
      setUrl("");
      setLoading(false);
      setImporting(false);
      setError(null);
      setUrlResults(null);
      setFileResults(null);
      setFileName(null);
      setParsingFile(false);
      setRowState({});
      setHideNeutrals(false);
      setGroupFilter(ALL_GROUPS);
    }
  }, [open]);

  const rows: PreparedRow[] = useMemo(() => {
    if (tab === "url") {
      if (!urlResults) return [];
      return urlResults.map((c, idx) => ({
        key: c.hex,
        hex: c.hex,
        label: c.hex.toUpperCase(),
        subtitle: (() => {
          const rgb = hexToRgb(c.hex);
          const parts: string[] = [];
          if (rgb) parts.push(formatRgb(rgb));
          if (c.count > 1) parts.push(`${c.count}x`);
          return parts.join(" · ");
        })(),
        defaultName: defaultNameFor(c.hex, idx),
        defaultTarget: "digital" as ImportTarget,
        mode: "rgb",
        count: c.count,
      }));
    }
    if (!fileResults) return [];
    return fileResults.map((c, idx) => {
      const target: ImportTarget =
        c.mode === "cmyk" || c.mode === "spot" ? "print" : "digital";
      const parts: string[] = [modeBadge(c.mode)];
      if (c.cmyk) parts.push(formatCmyk(c.cmyk));
      else parts.push(c.hex.toUpperCase());
      if (c.spot?.book) parts.push(c.spot.book);
      if (c.group) parts.push(c.group);
      return {
        key: `file-${idx}-${c.hex}-${c.mode}`,
        hex: c.hex,
        label: c.hex.toUpperCase(),
        subtitle: parts.join(" · "),
        defaultName: c.name || defaultNameFor(c.hex, idx),
        defaultTarget: target,
        cmyk: c.cmyk,
        spot: c.spot,
        mode: c.mode,
        group: c.group,
      };
    });
  }, [tab, urlResults, fileResults]);

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.group) set.add(row.group);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (hideNeutrals) {
        const l = luminance(row.hex);
        if (!(l > 0.02 && l < 0.98)) return false;
      }
      if (groupFilter !== ALL_GROUPS) {
        if ((row.group ?? "") !== groupFilter) return false;
      }
      return true;
    });
  }, [rows, hideNeutrals, groupFilter]);

  const selectedCount = useMemo(
    () => filteredRows.filter((row) => rowState[row.key]?.selected).length,
    [filteredRows, rowState]
  );

  const hasResults = tab === "url" ? urlResults !== null : fileResults !== null;

  const seedRowState = (preparedRows: PreparedRow[]) => {
    const next: Record<string, RowState> = {};
    preparedRows.forEach((row) => {
      next[row.key] = {
        selected: false,
        name: row.defaultName,
        target: row.defaultTarget,
      };
    });
    setRowState(next);
  };

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
    setUrlResults(null);
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      const response = await fetch("/api/extract-colors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: withProtocol }),
      });
      const data = (await response.json().catch(() => null)) as
        | { colors?: ExtractedColor[]; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }
      const colors = data?.colors ?? [];
      setUrlResults(colors);
      const prepared: PreparedRow[] = colors.map((c, idx) => ({
        key: c.hex,
        hex: c.hex,
        label: c.hex.toUpperCase(),
        subtitle: "",
        defaultName: defaultNameFor(c.hex, idx),
        defaultTarget: "digital",
        mode: "rgb",
      }));
      seedRowState(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setParsingFile(true);
    setError(null);
    setFileResults(null);
    setFileName(file.name);
    try {
      const parsed = await parseCclibsFile(file);
      setFileResults(parsed);
      if (parsed.length === 0) {
        setError("Keine Farben in dieser Datei gefunden.");
      }
      const prepared: PreparedRow[] = parsed.map((c, idx) => {
        const target: ImportTarget =
          c.mode === "cmyk" || c.mode === "spot" ? "print" : "digital";
        return {
          key: `file-${idx}-${c.hex}-${c.mode}`,
          hex: c.hex,
          label: c.hex.toUpperCase(),
          subtitle: "",
          defaultName: c.name || defaultNameFor(c.hex, idx),
          defaultTarget: target,
          cmyk: c.cmyk,
          spot: c.spot,
          mode: c.mode,
        };
      });
      seedRowState(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFileResults(null);
    } finally {
      setParsingFile(false);
    }
  };

  const updateRow = (key: string, patch: Partial<RowState>) => {
    setRowState((prev) => {
      const base = prev[key] ?? {
        selected: false,
        name: "",
        target: "digital" as ImportTarget,
      };
      return { ...prev, [key]: { ...base, ...patch } };
    });
  };

  const toggleRow = (key: string) => {
    updateRow(key, { selected: !(rowState[key]?.selected ?? false) });
  };

  const setRowName = (key: string, name: string) => {
    updateRow(key, { name });
  };

  const setRowTarget = (key: string, target: ImportTarget) => {
    updateRow(key, { target });
  };

  const selectAllVisible = () => {
    setRowState((prev) => {
      const next = { ...prev };
      for (const row of filteredRows) {
        next[row.key] = {
          ...(next[row.key] ?? {
            selected: false,
            name: row.defaultName,
            target: row.defaultTarget,
          }),
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
    if (importing || loading || parsingFile) return;
    const selected: ImportColorItem[] = filteredRows
      .filter((row) => rowState[row.key]?.selected)
      .map((row) => {
        const state = rowState[row.key];
        const name = (state?.name || row.defaultName).trim();
        return {
          hex: row.hex,
          name,
          target: state?.target ?? row.defaultTarget,
          cmyk: row.cmyk,
          spot: row.spot,
          mode: row.mode,
        };
      })
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

  const busy = loading || importing || parsingFile;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Farben importieren"
      description="Farben aus einer Website-URL lesen oder eine Adobe Creative Cloud Library (.cclibs / .cclib) hochladen."
      widthClassName="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label="Importquelle"
          className="flex gap-1 rounded-full bg-black/5 p-1 text-xs font-medium"
        >
          {([
            { id: "url", label: "URL" },
            { id: "file", label: "Import" },
          ] as const).map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (busy) return;
                  setTab(t.id);
                  setError(null);
                }}
                className={`flex-1 rounded-full px-3 py-1.5 uppercase tracking-widest transition ${
                  isActive
                    ? "bg-black text-white"
                    : "text-black/60 hover:text-black"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "url" && (
          <form onSubmit={handleGenerate} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm text-black/70">
              Website-URL
              <div className="flex gap-2">
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com"
                  disabled={busy}
                  className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
                <button
                  type="submit"
                  disabled={busy || !url.trim()}
                  className="shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Lese …" : "Farben generieren"}
                </button>
              </div>
            </label>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-black/60">
                <span
                  className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black"
                  aria-hidden
                />
                Farben werden aus der Seite extrahiert …
              </div>
            )}
          </form>
        )}

        {tab === "file" && (
          <div className="flex flex-col gap-2">
            <div
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition ${
                parsingFile
                  ? "border-black/20 bg-black/[0.03]"
                  : "border-black/20 bg-black/[0.02] hover:bg-black/[0.04]"
              }`}
            >
              <p className="text-sm font-medium text-black">
                Creative Cloud Library hochladen
              </p>
              <p className="max-w-sm text-xs text-black/55">
                Unterstützt `.cclibs` und `.cclib` Exports. Farben werden in
                Print (CMYK / Pantone) oder Digital (HEX / RGB) einsortiert.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".cclibs,.cclib,application/zip"
                disabled={busy}
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {parsingFile ? "Verarbeite …" : "Datei auswählen"}
              </button>
              {fileName && !parsingFile && (
                <p className="text-[11px] text-black/50">{fileName}</p>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            Fehler: {error}
          </p>
        )}

        {hasResults && !loading && !parsingFile && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-black/60">
              <span>
                {rows.length} Farben gefunden
                {rows.length !== filteredRows.length
                  ? ` (${filteredRows.length} sichtbar)`
                  : ""}
                · {selectedCount} ausgewaehlt
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {tab === "file" && groupOptions.length > 0 && (
                  <label className="flex items-center gap-1">
                    <span className="text-black/50">Kategorie</span>
                    <select
                      value={groupFilter}
                      onChange={(event) => {
                        setGroupFilter(event.target.value);
                      }}
                      className="rounded-md border border-black/15 bg-white px-2 py-1 text-[11px] font-medium text-black/80 outline-none focus:border-black"
                    >
                      <option value={ALL_GROUPS}>Alle</option>
                      {groupOptions.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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

            {filteredRows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-3 py-6 text-center text-sm text-black/50">
                Keine Farben gefunden.
              </p>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-black/10">
                <ul className="divide-y divide-black/5">
                  {filteredRows.map((row) => {
                    const state = rowState[row.key];
                    const rgb = hexToRgb(row.hex);
                    const subtitle =
                      row.subtitle ||
                      (() => {
                        const parts: string[] = [];
                        if (tab === "file") parts.push(modeBadge(row.mode));
                        if (row.cmyk) parts.push(formatCmyk(row.cmyk));
                        else parts.push(row.hex.toUpperCase());
                        if (rgb && !row.cmyk) parts.push(formatRgb(rgb));
                        if (row.spot?.book) parts.push(row.spot.book);
                        if (row.count && row.count > 1)
                          parts.push(`${row.count}x`);
                        return parts.join(" · ");
                      })();
                    return (
                      <li
                        key={row.key}
                        className={`flex items-center gap-3 px-3 py-2 transition ${state?.selected ? "bg-black/[0.04]" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={state?.selected ?? false}
                          onChange={() => toggleRow(row.key)}
                          aria-label={`Farbe ${row.label} auswaehlen`}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-black"
                        />
                        <span
                          aria-hidden
                          className="h-10 w-10 shrink-0 rounded-lg border border-black/10"
                          style={{ backgroundColor: row.hex }}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <input
                            type="text"
                            value={state?.name ?? ""}
                            onChange={(event) =>
                              setRowName(row.key, event.target.value)
                            }
                            placeholder={`Farbname (${row.label})`}
                            className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-sm text-black outline-none focus:border-black/20 focus:bg-white"
                          />
                          <span className="px-1 text-[11px] font-mono text-black/50">
                            {subtitle}
                          </span>
                        </div>
                        {tab === "file" && (
                          <select
                            value={state?.target ?? row.defaultTarget}
                            onChange={(event) =>
                              setRowTarget(
                                row.key,
                                event.target.value as ImportTarget
                              )
                            }
                            aria-label="Zielgruppe"
                            className="shrink-0 rounded-md border border-black/15 bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-black/70 outline-none focus:border-black"
                          >
                            <option value="print">Print</option>
                            <option value="digital">Digital</option>
                          </select>
                        )}
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
            disabled={busy}
            className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-black/5 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={busy || !hasResults || selectedCount === 0}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing
              ? "Importiert …"
              : selectedCount > 0
                ? `${selectedCount} Farben hinzufuegen`
                : "Ausgewaehlte hinzufuegen"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
