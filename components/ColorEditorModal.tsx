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
  type Cmyk,
  type Rgb,
} from "@/lib/color";

import Modal from "./Modal";

export type EditorCategory = {
  id: string;
  key: string;
  label: string;
};

type Mode = "add" | "edit";

export type ColorRole = "primary" | "secondary" | null;

export type ColorEditorInitial = {
  name: string;
  hex: string;
  role: ColorRole;
  // In edit mode: the currently active category is "pinned".
  categoryId: string;
  value: string;
};

export type AddSubmit = {
  mode: "add";
  name: string;
  hex: string;
  role: ColorRole;
  values: Record<string, string>;
};

export type EditSubmit = {
  mode: "edit";
  name: string;
  hex: string;
  role: ColorRole;
  categoryId: string;
  value: string;
};

export type ColorEditorSubmit = AddSubmit | EditSubmit;

type ColorEditorModalProps = {
  open: boolean;
  mode: Mode;
  group: "print" | "digital";
  categories: EditorCategory[];
  initial?: ColorEditorInitial;
  onClose: () => void;
  onSubmit: (payload: ColorEditorSubmit) => Promise<void>;
  onDelete?: () => Promise<void>;
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

function emptyValues(categories: EditorCategory[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const cat of categories) obj[cat.id] = "";
  return obj;
}

export default function ColorEditorModal({
  open,
  mode,
  group,
  categories,
  initial,
  onClose,
  onSubmit,
  onDelete,
}: ColorEditorModalProps) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#000000");
  const [rgb, setRgb] = useState<Rgb>({ r: 0, g: 0, b: 0 });
  const [cmyk, setCmyk] = useState<Cmyk>({ c: 0, m: 0, y: 0, k: 100 });
  const [role, setRole] = useState<ColorRole>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setDeleting(false);
      setError(null);
      return;
    }
    if (mode === "edit" && initial) {
      setName(initial.name);
      const base = normalizeHex(initial.hex) ?? "#000000";
      setHex(base);
      setRgb(hexToRgb(base) ?? { r: 0, g: 0, b: 0 });
      setCmyk(hexToCmyk(base) ?? { c: 0, m: 0, y: 0, k: 100 });
      setRole(initial.role ?? null);
      const initValues = emptyValues(categories);
      initValues[initial.categoryId] = initial.value ?? "";
      setValues(initValues);
      setActiveCategoryId(initial.categoryId);
    } else {
      setName("");
      setHex("#000000");
      setRgb({ r: 0, g: 0, b: 0 });
      setCmyk({ c: 0, m: 0, y: 0, k: 100 });
      setRole(null);
      setValues(emptyValues(categories));
      setActiveCategoryId(categories[0]?.id ?? "");
    }
  }, [open, mode, initial, categories]);

  const hexCategory = useMemo(
    () => categories.find((c) => isHexKey(c.key)) ?? null,
    [categories]
  );
  const rgbCategory = useMemo(
    () => categories.find((c) => isRgbKey(c.key)) ?? null,
    [categories]
  );
  const cmykCategory = useMemo(
    () => categories.find((c) => isCmykKey(c.key)) ?? null,
    [categories]
  );

  const setValue = (categoryId: string, value: string) => {
    setValues((prev) => ({ ...prev, [categoryId]: value }));
  };

  const applyHex = (nextHex: string) => {
    const normalized = normalizeHex(nextHex);
    setHex(nextHex);
    if (!normalized) return;
    setRgb(hexToRgb(normalized) ?? rgb);
    setCmyk(hexToCmyk(normalized) ?? cmyk);
    if (hexCategory) setValue(hexCategory.id, normalized);
    if (rgbCategory) {
      const r = hexToRgb(normalized);
      if (r) setValue(rgbCategory.id, formatRgb(r));
    }
    if (cmykCategory) {
      const c = hexToCmyk(normalized);
      if (c) setValue(cmykCategory.id, formatCmyk(c));
    }
  };

  const applyCmyk = (next: Cmyk) => {
    const clamped: Cmyk = {
      c: clamp(next.c, 0, 100),
      m: clamp(next.m, 0, 100),
      y: clamp(next.y, 0, 100),
      k: clamp(next.k, 0, 100),
    };
    setCmyk(clamped);
    const nextHex = cmykToHex(clamped);
    setHex(nextHex);
    setRgb(hexToRgb(nextHex) ?? rgb);
    if (hexCategory) setValue(hexCategory.id, nextHex);
    if (rgbCategory) {
      const r = hexToRgb(nextHex);
      if (r) setValue(rgbCategory.id, formatRgb(r));
    }
    if (cmykCategory) setValue(cmykCategory.id, formatCmyk(clamped));
  };

  const applyRgb = (next: Rgb) => {
    const clamped: Rgb = {
      r: clamp(next.r, 0, 255),
      g: clamp(next.g, 0, 255),
      b: clamp(next.b, 0, 255),
    };
    setRgb(clamped);
    const nextHex = rgbToHex(clamped);
    setHex(nextHex);
    setCmyk(hexToCmyk(nextHex) ?? cmyk);
    if (hexCategory) setValue(hexCategory.id, nextHex);
    if (rgbCategory) setValue(rgbCategory.id, formatRgb(clamped));
    if (cmykCategory) {
      const c = hexToCmyk(nextHex);
      if (c) setValue(cmykCategory.id, formatCmyk(c));
    }
  };

  const handleRawValueChange = (cat: EditorCategory, value: string) => {
    setValue(cat.id, value);
    if (isHexKey(cat.key)) {
      const parsed = normalizeHex(value);
      if (parsed) {
        setHex(parsed);
        setRgb(hexToRgb(parsed) ?? rgb);
        setCmyk(hexToCmyk(parsed) ?? cmyk);
        if (rgbCategory)
          setValue(rgbCategory.id, formatRgb(hexToRgb(parsed) ?? rgb));
        if (cmykCategory)
          setValue(cmykCategory.id, formatCmyk(hexToCmyk(parsed) ?? cmyk));
      }
    } else if (isRgbKey(cat.key)) {
      const parsed = parseRgb(value);
      if (parsed) {
        setRgb(parsed);
        const nextHex = rgbToHex(parsed);
        setHex(nextHex);
        setCmyk(hexToCmyk(nextHex) ?? cmyk);
        if (hexCategory) setValue(hexCategory.id, nextHex);
        if (cmykCategory)
          setValue(cmykCategory.id, formatCmyk(hexToCmyk(nextHex) ?? cmyk));
      }
    } else if (isCmykKey(cat.key)) {
      const parsed = parseCmyk(value);
      if (parsed) {
        setCmyk(parsed);
        const nextHex = cmykToHex(parsed);
        setHex(nextHex);
        setRgb(hexToRgb(nextHex) ?? rgb);
        if (hexCategory) setValue(hexCategory.id, nextHex);
        if (rgbCategory)
          setValue(rgbCategory.id, formatRgb(hexToRgb(nextHex) ?? rgb));
      }
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || deleting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) {
      setError("Bitte einen gueltigen HEX-Wert angeben.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (mode === "add") {
        const cleaned: Record<string, string> = {};
        for (const cat of categories) {
          const v = values[cat.id]?.trim();
          if (v) cleaned[cat.id] = v;
        }
        // HEX kategorie ist Pflicht, wir setzen sie explizit
        if (hexCategory) cleaned[hexCategory.id] = normalizedHex;
        await onSubmit({
          mode: "add",
          name: trimmedName,
          hex: normalizedHex,
          role,
          values: cleaned,
        });
      } else {
        if (!activeCategoryId) {
          setError("Keine Kategorie gewaehlt.");
          setSaving(false);
          return;
        }
        const raw = values[activeCategoryId] ?? "";
        let value = raw.trim();
        if (!value) {
          const cat = categories.find((c) => c.id === activeCategoryId);
          if (cat && isHexKey(cat.key)) value = normalizedHex;
          else if (cat && isRgbKey(cat.key)) value = formatRgb(rgb);
          else if (cat && isCmykKey(cat.key)) value = formatCmyk(cmyk);
          else {
            setError("Bitte einen Wert eingeben.");
            setSaving(false);
            return;
          }
        }
        await onSubmit({
          mode: "edit",
          name: trimmedName,
          hex: normalizedHex,
          role,
          categoryId: activeCategoryId,
          value,
        });
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!onDelete || deleting || saving) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Farbe wirklich loeschen?")
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setDeleting(false);
      return;
    }
    setDeleting(false);
    onClose();
  };

  const title = mode === "edit" ? "Farbe bearbeiten" : "Neue Farbe";
  const description =
    mode === "edit"
      ? "Aendere Name, HEX oder den Wert der aktuellen Kategorie."
      : `Gib Name, HEX und optional Werte fuer die ${group === "print" ? "Print" : "Digital"}-Kategorien an.`;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving && !deleting) onClose();
      }}
      title={title}
      description={description}
      widthClassName="max-w-xl"
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
            disabled={saving || deleting}
            placeholder="z.B. Swoosh Black"
            className="rounded-lg border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-black/70">
          HEX *
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={normalizeHex(hex) ?? "#000000"}
              onChange={(event) => applyHex(event.target.value)}
              disabled={saving || deleting}
              className="h-10 w-12 cursor-pointer rounded-lg border border-black/15"
              aria-label="Farbe waehlen"
            />
            <input
              type="text"
              value={hex}
              onChange={(event) => applyHex(event.target.value)}
              placeholder="#1D3FA5"
              required
              disabled={saving || deleting}
              className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            />
          </div>
        </label>

        <div className="flex flex-col gap-1 text-sm text-black/70">
          <span>Rolle</span>
          <div
            role="radiogroup"
            aria-label="Rolle der Farbe"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-black/15 bg-white p-1"
          >
            {(
              [
                { value: null, label: "Keine" },
                { value: "primary", label: "Primary" },
                { value: "secondary", label: "Secondary" },
              ] as const
            ).map((opt) => {
              const active = role === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRole(opt.value)}
                  disabled={saving || deleting}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-widest transition ${
                    active
                      ? "bg-black text-white"
                      : "text-black/60 hover:text-black"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-black/40">
            Wird spaeter fuer Web/CSS-Exports als <code>--color-primary</code> /{" "}
            <code>--color-secondary</code> verwendet.
          </span>
        </div>

        {mode === "edit" && categories.length > 1 && (
          <label className="flex flex-col gap-1 text-sm text-black/70">
            Kategorie
            <select
              value={activeCategoryId}
              onChange={(event) => setActiveCategoryId(event.target.value)}
              disabled={saving || deleting}
              className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === "add" && categories.length > 0 && (
          <fieldset className="flex flex-col gap-3 rounded-xl bg-black/[0.03] p-3">
            <legend className="px-1 text-[10px] font-medium uppercase tracking-widest text-black/40">
              Werte pro Kategorie (optional, HEX wird automatisch gesetzt)
            </legend>
            {categories.map((cat) => {
              if (isHexKey(cat.key)) return null;
              return renderCategoryInput(cat);
            })}
          </fieldset>
        )}

        {mode === "edit" &&
          activeCategoryId &&
          (() => {
            const cat = categories.find((c) => c.id === activeCategoryId);
            if (!cat) return null;
            if (isHexKey(cat.key)) return null;
            return (
              <div className="flex flex-col gap-2 rounded-xl bg-black/[0.03] p-3">
                {renderCategoryInput(cat)}
              </div>
            );
          })()}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            Fehler: {error}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          {mode === "edit" && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Loescht …" : "Farbe loeschen"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-black/5 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving || deleting || !name.trim() || !normalizeHex(hex)}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Speichert …"
                : mode === "edit"
                  ? "Speichern"
                  : "Farbe anlegen"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );

  function renderCategoryInput(cat: EditorCategory) {
    if (isCmykKey(cat.key)) {
      return (
        <div key={cat.id} className="flex flex-col gap-2">
          <span className="px-1 text-[11px] font-medium uppercase tracking-widest text-black/50">
            {cat.label}
          </span>
          <div className="grid grid-cols-4 gap-2">
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
                    applyCmyk({ ...cmyk, [channel]: Number(event.target.value) })
                  }
                  disabled={saving || deleting}
                  className="rounded-lg border border-black/15 bg-white px-2 py-2 text-sm font-mono text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            ))}
          </div>
        </div>
      );
    }
    if (isRgbKey(cat.key)) {
      return (
        <div key={cat.id} className="flex flex-col gap-2">
          <span className="px-1 text-[11px] font-medium uppercase tracking-widest text-black/50">
            {cat.label}
          </span>
          <div className="grid grid-cols-3 gap-2">
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
                    applyRgb({ ...rgb, [channel]: Number(event.target.value) })
                  }
                  disabled={saving || deleting}
                  className="rounded-lg border border-black/15 bg-white px-2 py-2 text-sm font-mono text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            ))}
          </div>
        </div>
      );
    }
    return (
      <label
        key={cat.id}
        className="flex items-center justify-between gap-3 text-sm text-black/70"
      >
        <span className="min-w-[72px] shrink-0 text-[11px] font-medium uppercase tracking-widest text-black/50">
          {cat.label}
        </span>
        <input
          type="text"
          value={values[cat.id] ?? ""}
          onChange={(event) => handleRawValueChange(cat, event.target.value)}
          placeholder={placeholderFor(cat.label)}
          disabled={saving || deleting}
          className="flex-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
        />
      </label>
    );
  }
}

function placeholderFor(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized === "cmyk") return "C0 M100 Y85 K10";
  if (normalized === "pantone") return "Pantone 186 C";
  if (normalized === "hex") return "#111111";
  if (normalized === "rgb") return "RGB 17, 17, 17";
  if (normalized === "hks") return "HKS 14";
  if (normalized === "ral") return "RAL 9010";
  return "Wert eingeben";
}
