"use client";

import { useEffect, useState, type FormEvent } from "react";

import Modal from "./Modal";

type AddCategoryDialogProps = {
  open: boolean;
  group: "print" | "digital";
  onClose: () => void;
  onSubmit: (payload: { label: string; key: string }) => Promise<void>;
};

function toKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) =>
      c === "ä" ? "ae" : c === "ö" ? "oe" : c === "ü" ? "ue" : "ss"
    )
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AddCategoryDialog({
  open,
  group,
  onClose,
  onSubmit,
}: AddCategoryDialogProps) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLabel("");
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ label: trimmed, key: toKey(trimmed) || `cat-${Date.now()}` });
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
      title="Neue Farbkategorie"
      description={
        group === "print"
          ? "Fuege eine neue Print-Kategorie hinzu (z.B. HKS, RAL)."
          : "Fuege eine neue Digital-Kategorie hinzu (z.B. HSL, OKLCH)."
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-black/70">
          Name der Kategorie
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="z.B. HKS"
            autoFocus
            disabled={saving}
            className="rounded-lg border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </label>

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
            disabled={saving || !label.trim()}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Speichert …" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
