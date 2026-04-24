"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  clamp,
  cmykToHex,
  formatCmyk,
  formatRgb,
  hexToCmyk,
  hexToRgb,
  normalizeHex,
  parseCmyk,
  parseRgb,
  rgbToHex,
} from "@/lib/color";

import Modal from "./Modal";

export type EditorCategory = {
  id: string;
  key: string;
  label: string;
};

type Mode = "add" | "edit";

export type ColorEditorInitial = {
  name: string;
  hex: string;
  // In edit mode: only this category is editable.
  categoryId: string;
  value: string;
};

export type ColorEditorSubmit = {
  name: string;
  hex: string;
  categoryId: string;
  value: string;
};

type ColorEditorModalProps = {
  open: boolean;
  mode: Mode;
  group: "print" | "digital";
  categories: EditorCategory[];
  initial?: ColorEditorInitial;
  onClose: () => void;
  onSubmit: (payload: ColorEditorSubmit) => Promise<void>;
};

function isCmykKey(key: string) {
  return key.toLowerCase() === "cmyk";
}
function isRgbKey(key: string) {
  return key.toLowerCase() === "rgb";
}
function isHexKey(key: string) {
  return key.toLowerCase() === "hex";
}

export default function ColorEditorModal({
  open,
  mode,
  group,
  categories,
  initial,
  onClose,
  onSubmit,
}: ColorEditorModalProps) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [hex, setHex] = useState("#000000");
  const [rawValue, setRawValue] = useState("");
  const [cmyk, setCmyk] = useState({ c: 0, m: 0, y: 0, k: 100 });
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setError(null);
      return;
    }
    if (mode === "edit" && initial) {
      setName(initial.name);
      setCategoryId(initial.categoryId);
      const baseHex = normalizeHex(initial.hex) ?? "#000000";
      setHex(baseHex);
      const baseRgb = hexToRgb(baseHex) ?? { r: 0, g: 0, b: 0 };
      setRgb(baseRgb);
      const baseCmyk = hexToCmyk(baseHex) ?? { c: 0, m: 0, y: 0, k: 100 };
      setCmyk(baseCmyk);
      setRawValue(initial.value ?? "");
      // If the stored value for CMYK/RGB is parseable, use it to derive hex.
      const cat = categories.find((c) => c.id === initial.categoryId);
      if (cat && isCmykKey(cat.key)) {
        const parsed = parseCmyk(initial.value);
        if (parsed) {
          setCmyk(parsed);
          setHex(cmykToHex(parsed));
          setRgb(hexToRgb(cmykToHex(parsed)) ?? baseRgb);
        }
      } else if (cat && isRgbKey(cat.key)) {
        const parsed = parseRgb(initial.value);
        if (parsed) {
          setRgb(parsed);
          setHex(rgbToHex(parsed));
          setCmyk(hexToCmyk(rgbToHex(parsed)) ?? baseCmyk);
        }
      } else if (cat && isHexKey(cat.key)) {
        const parsed = normalizeHex(initial.value);
        if (parsed) {
          setHex(parsed);
          setRgb(hexToRgb(parsed) ?? baseRgb);
          setCmyk(hexToCmyk(parsed) ?? baseCmyk);
        }
      }
    } else {
      setName("");
      setCategoryId(categories[0]?.id ?? "");
      setHex("#000000");
      setRgb({ r: 0, g: 0, b: 0 });
      setCmyk({ c: 0, m: 0, y: 0, k: 100 });
      setRawValue("");
    }
  }, [open, mode, initial, categories]);

  const updateFromHex = (nextHex: string) => {
    setHex(nextHex);
    const parsedRgb = hexToRgb(nextHex);
    if (parsedRgb) setRgb(parsedRgb);
    const parsedCmyk = hexToCmyk(nextHex);
    if (parsedCmyk) setCmyk(parsedCmyk);
    if (activeCategory) {
      if (isHexKey(activeCategory.key)) setRawValue(nextHex);
      else if (isRgbKey(activeCategory.key) && parsedRgb)
        setRawValue(formatRgb(parsedRgb));
      else if (isCmykKey(activeCategory.key) && parsedCmyk)
        setRawValue(formatCmyk(parsedCmyk));
    }
  };

  const updateCmyk = (next: typeof cmyk) => {
    const clamped = {
      c: clamp(next.c, 0, 100),
      m: clamp(next.m, 0, 100),
      y: clamp(next.y, 0, 100),
      k: clamp(next.k, 0, 100),
    };
    setCmyk(clamped);
    const nextHex = cmykToHex(clamped);
    setHex(nextHex);
    setRgb(hexToRgb(nextHex) ?? rgb);
    setRawValue(formatCmyk(clamped));
  };

  const updateRgb = (next: typeof rgb) => {
    const clamped = {
      r: clamp(next.r, 0, 255),
      g: clamp(next.g, 0, 255),
      b: clamp(next.b, 0, 255),
    };
    setRgb(clamped);
    const nextHex = rgbToHex(clamped);
    setHex(nextHex);
    setCmyk(hexToCmyk(nextHex) ?? cmyk);
    setRawValue(formatRgb(clamped));
  };

  const handleRawValueChange = (value: string) => {
    setRawValue(value);
    if (!activeCategory) return;
    if (isHexKey(activeCategory.key)) {
      const parsed = normalizeHex(value);
      if (parsed) {
        setHex(parsed);
        setRgb(hexToRgb(parsed) ?? rgb);
        setCmyk(hexToCmyk(parsed) ?? cmyk);
      }
    } else if (isRgbKey(activeCategory.key)) {
      const parsed = parseRgb(value);
      if (parsed) {
        setRgb(parsed);
        const nextHex = rgbToHex(parsed);
        setHex(nextHex);
        setCmyk(hexToCmyk(nextHex) ?? cmyk);
      }
    } else if (isCmykKey(activeCategory.key)) {
      const parsed = parseCmyk(value);
      if (parsed) {
        setCmyk(parsed);
        const nextHex = cmykToHex(parsed);
        setHex(nextHex);
        setRgb(hexToRgb(nextHex) ?? rgb);
      }
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    if (!activeCategory) {
      setError("Bitte eine Kategorie waehlen.");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    const baseHex = normalizeHex(hex);
    if (!baseHex) {
      setError("Ungueltiger Farbwert.");
      return;
    }

    let value = rawValue.trim();
    if (!value) {
      if (isCmykKey(activeCategory.key)) value = formatCmyk(cmyk);
      else if (isRgbKey(activeCategory.key)) value = formatRgb(rgb);
      else if (isHexKey(activeCategory.key)) value = baseHex;
      else {
        setError("Bitte einen Wert eingeben.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        hex: baseHex,
        categoryId: activeCategory.id,
        value,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  };

  const title = mode === "edit" ? "Farbe bearbeiten" : "Neue Farbe";
  const description =
    mode === "edit"
      ? `Aendere den ${activeCategory?.label ?? "Wert"} fuer diese Farbe.`
      : `Waehle eine Kategorie und gib den ${group === "print" ? "Print" : "Digital"}-Farbwert an.`;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={title}
      description={description}
      widthClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="h-16 w-16 shrink-0 rounded-xl border border-black/10"
            style={{
              backgroundColor: normalizeHex(hex) ?? "#000000",
              transition: "background-color 200ms ease",
            }}
          />
          <div className="flex flex-col gap-1 text-[11px] font-mono text-black/60">
            <span>{normalizeHex(hex) ?? "–"}</span>
            <span>{formatCmyk(cmyk)}</span>
            <span>{formatRgb(rgb)}</span>
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm text-black/70">
          Farbname
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving || mode === "edit"}
            placeholder="z.B. Swoosh Black"
            className="rounded-lg border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:bg-black/[0.03] disabled:text-black/60"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-black/70">
          Farbkategorie
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setRawValue("");
            }}
            disabled={saving || mode === "edit" || categories.length === 0}
            className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:bg-black/[0.03] disabled:text-black/60"
          >
            {categories.length === 0 && (
              <option value="">Keine Kategorie vorhanden</option>
            )}
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </label>

        {activeCategory && isCmykKey(activeCategory.key) && (
          <fieldset className="grid grid-cols-4 gap-3 rounded-xl bg-black/[0.03] p-3">
            <legend className="px-1 text-[10px] font-medium uppercase tracking-widest text-black/40">
              CMYK
            </legend>
            {(["c", "m", "y", "k"] as const).map((channel) => (
              <label
                key={channel}
                className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-widest text-black/50"
              >
                {channel}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={cmyk[channel]}
                  onChange={(event) =>
                    updateCmyk({
                      ...cmyk,
                      [channel]: Number(event.target.value),
                    })
                  }
                  disabled={saving}
                  className="rounded-lg border border-black/15 bg-white px-2 py-2 text-sm font-mono text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            ))}
          </fieldset>
        )}

        {activeCategory && isRgbKey(activeCategory.key) && (
          <fieldset className="grid grid-cols-3 gap-3 rounded-xl bg-black/[0.03] p-3">
            <legend className="px-1 text-[10px] font-medium uppercase tracking-widest text-black/40">
              RGB
            </legend>
            {(["r", "g", "b"] as const).map((channel) => (
              <label
                key={channel}
                className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-widest text-black/50"
              >
                {channel}
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[channel]}
                  onChange={(event) =>
                    updateRgb({
                      ...rgb,
                      [channel]: Number(event.target.value),
                    })
                  }
                  disabled={saving}
                  className="rounded-lg border border-black/15 bg-white px-2 py-2 text-sm font-mono text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            ))}
          </fieldset>
        )}

        {activeCategory && isHexKey(activeCategory.key) && (
          <label className="flex flex-col gap-1 text-sm text-black/70">
            HEX
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={normalizeHex(hex) ?? "#000000"}
                onChange={(event) => updateFromHex(event.target.value)}
                disabled={saving}
                className="h-10 w-12 cursor-pointer rounded-lg border border-black/15"
                aria-label="Farbe waehlen"
              />
              <input
                type="text"
                value={rawValue || hex}
                onChange={(event) => handleRawValueChange(event.target.value)}
                placeholder="#1D3FA5"
                disabled={saving}
                className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </div>
          </label>
        )}

        {activeCategory &&
          !isCmykKey(activeCategory.key) &&
          !isRgbKey(activeCategory.key) &&
          !isHexKey(activeCategory.key) && (
            <label className="flex flex-col gap-1 text-sm text-black/70">
              {activeCategory.label}-Wert
              <input
                type="text"
                value={rawValue}
                onChange={(event) => setRawValue(event.target.value)}
                placeholder={`z.B. ${activeCategory.label} …`}
                disabled={saving}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </label>
          )}

        {activeCategory &&
          !isCmykKey(activeCategory.key) &&
          !isRgbKey(activeCategory.key) &&
          !isHexKey(activeCategory.key) && (
            <label className="flex flex-col gap-1 text-sm text-black/70">
              Vorschau-HEX (optional)
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={normalizeHex(hex) ?? "#000000"}
                  onChange={(event) => updateFromHex(event.target.value)}
                  disabled={saving}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-black/15"
                  aria-label="Vorschau waehlen"
                />
                <input
                  type="text"
                  value={hex}
                  onChange={(event) => updateFromHex(event.target.value)}
                  placeholder="#1D3FA5"
                  disabled={saving}
                  className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </div>
            </label>
          )}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            Fehler: {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-black/5 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={saving || !activeCategory || (mode === "add" && !name.trim())}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? "Speichert …"
              : mode === "edit"
                ? "Speichern"
                : "Farbe anlegen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
