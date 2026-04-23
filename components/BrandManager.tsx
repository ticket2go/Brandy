"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

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
  const [formOpen, setFormOpen] = useState(false);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!formOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) closeForm();
    };
    window.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let cancelled = false;
    (async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !overlayRef.current || !panelRef.current) return;
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0, backdropFilter: "blur(0px)" },
        {
          opacity: 1,
          backdropFilter: "blur(18px)",
          duration: 0.45,
          ease: "power3.out",
        }
      );
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 30, filter: "blur(16px)", scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          scale: 1,
          duration: 0.55,
          ease: "power3.out",
        }
      );
      inputRef.current?.focus();
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen]);

  const closeForm = async () => {
    if (saving) return;
    const gsap = (await import("gsap")).default;
    if (!overlayRef.current || !panelRef.current) {
      setFormOpen(false);
      return;
    }
    gsap.to(panelRef.current, {
      opacity: 0,
      y: 20,
      filter: "blur(12px)",
      scale: 0.98,
      duration: 0.3,
      ease: "power2.in",
    });
    gsap.to(overlayRef.current, {
      opacity: 0,
      backdropFilter: "blur(0px)",
      duration: 0.35,
      ease: "power2.in",
      onComplete: () => {
        setFormOpen(false);
        setName("");
      },
    });
  };

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
      setSaving(false);
    } else if (data) {
      setBrands((prev) => [...prev, data]);
      setSaving(false);
      closeForm();
    } else {
      setSaving(false);
    }
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
    <>
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        aria-label="Neue Brand anlegen"
        title="Neue Brand anlegen"
        className="fixed left-6 top-6 z-40 flex h-24 w-24 items-center justify-center rounded-full bg-black text-white shadow-sm transition hover:scale-105 hover:bg-black/85"
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6">
        {error && !formOpen && (
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
      </section>

      {formOpen && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label="Neue Brand anlegen"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          style={{ backdropFilter: "blur(18px)" }}
          onClick={() => closeForm()}
        >
          <div
            ref={panelRef}
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <label htmlFor="brand-name-overlay" className="sr-only">
                Brandname
              </label>
              <input
                ref={inputRef}
                id="brand-name-overlay"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Brandname …"
                disabled={saving}
                autoComplete="off"
                className="w-full rounded-3xl border-0 bg-white px-10 py-10 font-semibold tracking-tight text-black placeholder:text-black/25 outline-none focus:outline-none focus:ring-0 disabled:opacity-60"
                style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)" }}
              />
              <div className="flex items-center justify-between gap-4 px-2">
                <button
                  type="button"
                  onClick={() => closeForm()}
                  disabled={saving}
                  className="text-base font-medium text-white/80 transition hover:text-white disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={!canSave}
                  className="rounded-full bg-white px-8 py-4 text-lg font-semibold text-black transition enabled:hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Speichert …" : "Anlegen"}
                </button>
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-100"
                >
                  Fehler: {error}
                </p>
              )}
            </form>
          </div>
        </div>
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
    </>
  );
}
