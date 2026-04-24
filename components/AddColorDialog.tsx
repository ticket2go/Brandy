"use client";

import { useEffect, useState, type FormEvent } from "react";

import Modal from "./Modal";

export type CategoryOption = {
  id: string;
  label: string;
};

type AddColorDialogProps = {
  open: boolean;
  group: "print" | "digital";
  categories: CategoryOption[];
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    hex: string;
    values: Record<string, string>;
  }) => Promise<void>;
};

function normalizeHex(input: string): string | null {
  const trimmed = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`.toUpperCase();
  }
  return null;
}

export default function AddColorDialog({
  open,
  group,
  categories,
  onClose,
  onSubmit,
}: AddColorDialogProps) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#000000");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setHex("#000000");
      setValues({});
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    const normalizedHex = normalizeHex(hex);
    if (!normalizedHex) {
      setError("Bitte einen gueltigen HEX-Wert angeben (z.B. #1D3FA5).");
      return;
    }

    const cleanedValues: Record<string, string> = {};
    for (const cat of categories) {
      const value = values[cat.id]?.trim();
      if (value) cleanedValues[cat.id] = value;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        hex: normalizedHex,
        values: cleanedValues,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={group === "print" ? "Neue Print-Farbe" : "Neue Digital-Farbe"}
      description="Gib den Namen, den Basis-HEX und optional Werte fuer die Kategorien an."
      widthClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1 text-sm text-black/70">
            Farbname
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="z.B. Swoosh Black"
              autoFocus
              disabled={saving}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-black/70">
            Basis-HEX
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={hex}
                onChange={(event) => setHex(event.target.value)}
                disabled={saving}
                className="h-10 w-12 cursor-pointer rounded-lg border border-black/15"
                aria-label="Farbe waehlen"
              />
              <input
                type="text"
                value={hex}
                onChange={(event) => setHex(event.target.value)}
                placeholder="#000000"
                disabled={saving}
                className="w-32 rounded-lg border border-black/15 px-3 py-2 font-mono text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </div>
          </label>
        </div>

        {categories.length > 0 && (
          <fieldset className="flex flex-col gap-3 rounded-xl bg-black/[0.03] p-3">
            <legend className="px-1 text-[10px] font-medium uppercase tracking-widest text-black/40">
              Werte pro Kategorie (optional)
            </legend>
            {categories.map((cat) => (
              <label
                key={cat.id}
                className="flex items-center justify-between gap-3 text-sm text-black/70"
              >
                <span className="min-w-[80px] shrink-0 text-[11px] font-medium uppercase tracking-widest text-black/50">
                  {cat.label}
                </span>
                <input
                  type="text"
                  value={values[cat.id] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [cat.id]: event.target.value }))
                  }
                  placeholder={placeholderFor(cat.label)}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            ))}
          </fieldset>
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
            disabled={saving || !name.trim()}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Speichert …" : "Farbe anlegen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function placeholderFor(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized === "cmyk") return "C0 M100 Y85 K10";
  if (normalized === "pantone") return "Pantone 186 C";
  if (normalized === "hex") return "#111111";
  if (normalized === "rgb") return "RGB 17, 17, 17";
  return "Wert eingeben";
}
