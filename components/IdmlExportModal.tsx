"use client";

import { useEffect, useMemo, useState } from "react";

import Modal from "./Modal";

import {
  IDML_PAGE_PRESETS_MM,
  buildPageSizeFromMm,
  type IdmlPageSize,
} from "@/lib/generateIdml";

type PresetKey = "A3" | "A4" | "A5" | "Letter" | "Square" | "Custom";
type Orientation = "portrait" | "landscape";

const PRESET_OPTIONS: { key: PresetKey; label: string }[] = [
  { key: "A4", label: "A4" },
  { key: "A3", label: "A3" },
  { key: "A5", label: "A5" },
  { key: "Letter", label: "Letter" },
  { key: "Square", label: "Quadrat" },
  { key: "Custom", label: "Custom" },
];

type IdmlExportModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (pageSize: IdmlPageSize) => void;
  busy?: boolean;
};

export default function IdmlExportModal({
  open,
  onClose,
  onConfirm,
  busy,
}: IdmlExportModalProps) {
  const [preset, setPreset] = useState<PresetKey>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [customWidth, setCustomWidth] = useState<string>("210");
  const [customHeight, setCustomHeight] = useState<string>("297");

  useEffect(() => {
    if (open) {
      setPreset("A4");
      setOrientation("portrait");
      setCustomWidth("210");
      setCustomHeight("297");
    }
  }, [open]);

  const derivedSize = useMemo<IdmlPageSize | null>(() => {
    if (preset === "Custom") {
      const w = parseFloat(customWidth.replace(",", "."));
      const h = parseFloat(customHeight.replace(",", "."));
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return null;
      }
      // Custom: Orientierung wird respektiert, auch wenn User andere Werte
      // eingibt – wir tauschen ggf. für die gewünschte Orientierung.
      const widthMm = orientation === "landscape" ? Math.max(w, h) : Math.min(w, h);
      const heightMm = orientation === "landscape" ? Math.min(w, h) : Math.max(w, h);
      // Quadrat (w===h) bleibt unverändert.
      if (w === h) {
        return buildPageSizeFromMm(w, h, orientation);
      }
      return buildPageSizeFromMm(widthMm, heightMm, orientation);
    }
    const dims = IDML_PAGE_PRESETS_MM[preset];
    return buildPageSizeFromMm(dims.widthMm, dims.heightMm, orientation);
  }, [preset, orientation, customWidth, customHeight]);

  const isSquare = preset === "Square";

  const handleConfirm = () => {
    if (!derivedSize || busy) return;
    onConfirm(derivedSize);
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Seitenformat für InDesign-Export"
      description="Wähle ein Seitenformat und die Orientierung für das generierte .idml."
      widthClassName="max-w-lg"
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-black/50">
            Preset
          </p>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_OPTIONS.map((opt) => {
              const active = preset === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPreset(opt.key)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    active
                      ? "border-black bg-black text-white"
                      : "border-black/15 bg-white text-black hover:bg-black/5"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-black/50">
            Orientierung
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "portrait", label: "Hochformat" },
                { key: "landscape", label: "Querformat" },
              ] as const
            ).map((opt) => {
              const active = orientation === opt.key;
              const disabled = isSquare;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => !disabled && setOrientation(opt.key)}
                  disabled={disabled}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    active && !disabled
                      ? "border-black bg-black text-white"
                      : "border-black/15 bg-white text-black hover:bg-black/5"
                  } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {isSquare && (
            <p className="mt-1 text-xs text-black/40">
              Quadrat hat keine Orientierung.
            </p>
          )}
        </div>

        {preset === "Custom" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-sm">
              <span className="mb-1 text-xs font-medium uppercase tracking-wider text-black/50">
                Breite (mm)
              </span>
              <input
                type="number"
                min={10}
                step={1}
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black"
              />
            </label>
            <label className="flex flex-col text-sm">
              <span className="mb-1 text-xs font-medium uppercase tracking-wider text-black/50">
                Höhe (mm)
              </span>
              <input
                type="number"
                min={10}
                step={1}
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black"
              />
            </label>
          </div>
        )}

        {derivedSize && (
          <p className="text-xs text-black/50">
            Ergebnis: {Math.round((derivedSize.widthPt / 72) * 25.4)} ×{" "}
            {Math.round((derivedSize.heightPt / 72) * 25.4)} mm
          </p>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!derivedSize || busy}
            className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <span
                  className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                Erstelle …
              </>
            ) : (
              "Export starten"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
