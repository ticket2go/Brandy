"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { supabase } from "@/lib/supabase/client";
import { safeQuery } from "@/lib/supabase/safeQuery";
import { useVisibilityReload } from "@/lib/useVisibilityReload";

import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";

type LocalEntry = {
  id: string;
  brand_id: string;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type LokalPanelProps = {
  brandId: string;
  onCountChange?: (count: number) => void;
};

export default function LokalPanel({ brandId, onCountChange }: LokalPanelProps) {
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<LocalEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reportCount = useCallback(
    (count: number) => {
      if (onCountChange) onCountChange(count);
    },
    [onCountChange]
  );

  const hasDataRef = useRef(false);

  const loadEntries = useCallback(async () => {
    if (!hasDataRef.current) {
      setLoading(true);
    }
    setError(null);
    let result;
    try {
      result = await safeQuery(
        () =>
          supabase
            .from("brand_local_entries")
            .select("id, brand_id, content, position, created_at, updated_at")
            .eq("brand_id", brandId)
            .order("position", { ascending: true })
            .order("created_at", { ascending: true }),
        { label: "brand-local-entries" }
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[LokalPanel] load failed", err);
      if (!hasDataRef.current) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      }
      setLoading(false);
      return;
    }
    const { data, error: loadError } = result;

    if (loadError) {
      if (!hasDataRef.current) {
        setError(loadError.message);
        setEntries([]);
        reportCount(0);
      }
    } else {
      hasDataRef.current = true;
      const rows = (data ?? []) as LocalEntry[];
      setEntries(rows);
      reportCount(rows.length);
    }
    setLoading(false);
  }, [brandId, reportCount]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useVisibilityReload(loadEntries);

  const handleCreate = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const nextPosition =
        entries.length > 0
          ? Math.max(...entries.map((e) => e.position)) + 1
          : 0;
      const { data, error: insertError } = await supabase
        .from("brand_local_entries")
        .insert({
          brand_id: brandId,
          content: trimmed,
          position: nextPosition,
        })
        .select("id, brand_id, content, position, created_at, updated_at")
        .single();
      if (insertError) {
        throw new Error(insertError.message);
      }
      if (data) {
        setEntries((prev) => {
          const next = [...prev, data as LocalEntry];
          reportCount(next.length);
          return next;
        });
      }
    },
    [brandId, entries, reportCount]
  );

  const handleDelete = useCallback(async () => {
    if (!entryToDelete || deleting) return;
    setDeleting(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from("brand_local_entries")
      .delete()
      .eq("id", entryToDelete.id);
    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== entryToDelete.id);
      reportCount(next.length);
      return next;
    });
    setDeleting(false);
    setEntryToDelete(null);
  }, [entryToDelete, deleting, reportCount]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-black">Lokal</h3>
        <p className="text-sm text-black/50">
          Lokale Texteinträge zur Brand – z.B. Adressen, Notizen oder regionale Hinweise.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Fehler: {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-black/50">Lade Einträge …</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          <AddLocalEntryCard onAdd={() => setAddOpen(true)} />
          {entries.map((entry) => (
            <LocalEntryCard
              key={entry.id}
              entry={entry}
              onDelete={() => setEntryToDelete(entry)}
            />
          ))}
        </div>
      )}

      <AddLocalEntryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleCreate}
      />

      <ConfirmDialog
        open={Boolean(entryToDelete)}
        title="Eintrag löschen?"
        description={
          entryToDelete
            ? `Möchtest du diesen Eintrag wirklich löschen? Die Aktion kann nicht rückgängig gemacht werden.`
            : ""
        }
        confirmLabel={deleting ? "Lösche …" : "Löschen"}
        cancelLabel="Abbrechen"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) setEntryToDelete(null);
        }}
      />
    </div>
  );
}

function AddLocalEntryCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label="Eintrag hinzufügen"
      title="Eintrag hinzufügen"
      className="group relative flex h-40 w-64 shrink-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/20 bg-black/[0.02] text-black transition-all duration-300 hover:-translate-y-1 hover:border-black/40 hover:bg-black/[0.04] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
    >
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full border border-black bg-white text-black transition-transform duration-300 group-hover:scale-105"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-black/60">
        Eintrag hinzufügen
      </span>
    </button>
  );
}

function LocalEntryCard({
  entry,
  onDelete,
}: {
  entry: LocalEntry;
  onDelete: () => void;
}) {
  return (
    <article className="group relative flex h-40 w-64 shrink-0 flex-col rounded-2xl border border-black/10 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <p className="flex-1 overflow-hidden whitespace-pre-wrap text-sm leading-snug text-black">
        {entry.content}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-black/40">
          {new Date(entry.created_at).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Eintrag löschen"
          title="Eintrag löschen"
          className="flex h-7 w-7 items-center justify-center rounded-md text-black/30 opacity-0 transition hover:bg-black/5 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 group-hover:opacity-100"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 4h8M5.5 4V2.7a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7V4M4 4l.5 7a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9L10 4"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </article>
  );
}

function AddLocalEntryDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setContent("");
      setFormError(null);
      setSaving(false);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
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
      title="Neuer Eintrag"
      description="Lege einen Texteintrag für den Bereich „Lokal“ an."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-black/70">
          Text
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Was möchtest du festhalten?"
            autoFocus
            rows={5}
            disabled={saving}
            className="resize-none rounded-lg border border-black/15 px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </label>

        {formError && (
          <p role="alert" className="text-sm text-red-700">
            Fehler: {formError}
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
            disabled={saving || !content.trim()}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Speichert …" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
