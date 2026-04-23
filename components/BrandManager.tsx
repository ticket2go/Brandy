"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase/client";
import { slugify } from "@/lib/slugify";

import BrandCard from "./BrandCard";
import ConfirmDialog from "./ConfirmDialog";

type Brand = {
  id: string;
  name: string;
};

export default function BrandManager() {
  const [name, setName] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadBrands = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("brands")
      .select("id, name")
      .order("created_at", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setBrands([]);
    } else {
      setBrands(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError(null);

    const baseSlug = slugify(trimmed);
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

    const { data, error: insertError } = await supabase
      .from("brands")
      .insert({ name: trimmed, slug: uniqueSlug })
      .select("id, name")
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setBrands((prev) => [...prev, data]);
      setName("");
    }

    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setError(null);

    const { error: deleteError } = await supabase
      .from("brands")
      .delete()
      .eq("id", pendingDelete.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setBrands((prev) => prev.filter((b) => b.id !== pendingDelete.id));
      setPendingDelete(null);
    }

    setDeleting(false);
  };

  const canSave = name.trim().length > 0 && !saving;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-row items-center gap-3"
      >
        <label htmlFor="brand-name" className="sr-only">
          Brandname
        </label>
        <input
          id="brand-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Brandname anlegen …"
          disabled={saving}
          className="flex-1 rounded-xl border border-black/15 bg-white px-4 py-3 text-base text-black placeholder:text-black/40 outline-none transition focus:border-black/60 focus:ring-2 focus:ring-black/10 disabled:opacity-60"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!canSave}
          aria-label={saving ? "Speichert" : "Brand anlegen"}
          title="Brand anlegen"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-sm transition enabled:hover:bg-black/80 enabled:hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <svg
              className="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="3"
              />
              <path
                d="M22 12a10 10 0 0 1-10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
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
          )}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Fehler: {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-black/50">Lade Brands …</p>
      ) : (
        brands.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {brands.map((brand) => (
              <BrandCard
                key={brand.id}
                name={brand.name}
                onDelete={() => setPendingDelete(brand)}
              />
            ))}
          </div>
        )
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Brand wirklich löschen?"
        description={
          pendingDelete
            ? `„${pendingDelete.name}" wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`
            : undefined
        }
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
      />
    </section>
  );
}
