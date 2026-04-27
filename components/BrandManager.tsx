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
import { useSession } from "./SessionProvider";

type Brand = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  legal_name: string | null;
  organization_id: string | null;
  colors: string[];
};

type BrandColorPreview = {
  brand_id: string;
  hex: string;
  group: "print" | "digital";
  position: number;
};

export default function BrandManager() {
  const { user, activeOrg, loading: sessionLoading } = useSession();
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
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
    if (!user || !activeOrg) {
      setBrands([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("brands")
      .select("id, name, slug, logo_url, legal_name, organization_id")
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setBrands([]);
      setLoading(false);
      return;
    }

    const baseBrands = (data ?? []) as Array<Omit<Brand, "colors">>;
    const brandIds = baseBrands.map((b) => b.id);

    let colorsByBrand = new Map<string, string[]>();
    if (brandIds.length > 0) {
      const { data: colorRows } = await supabase
        .from("brand_colors")
        .select("brand_id, hex, group, position")
        .in("brand_id", brandIds)
        .order("position", { ascending: true });

      if (colorRows) {
        const rows = colorRows as BrandColorPreview[];
        const preferredOrder: BrandColorPreview["group"][] = [
          "print",
          "digital",
        ];
        for (const brandId of brandIds) {
          const brandRows = rows.filter((r) => r.brand_id === brandId);
          let picked: BrandColorPreview[] = [];
          for (const group of preferredOrder) {
            const subset = brandRows
              .filter((r) => r.group === group)
              .sort((a, b) => a.position - b.position);
            if (subset.length > 0) {
              picked = subset;
              break;
            }
          }
          const seen = new Set<string>();
          const hexes: string[] = [];
          for (const row of picked) {
            const normalized = row.hex.toUpperCase();
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            hexes.push(normalized);
            if (hexes.length >= 3) break;
          }
          colorsByBrand.set(brandId, hexes);
        }
      }
    }

    setBrands(
      baseBrands.map((b) => ({
        ...b,
        colors: colorsByBrand.get(b.id) ?? [],
      }))
    );
    setLoading(false);
  }, [activeOrg, user]);

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
        {
          opacity: 0,
          backdropFilter: "blur(0px)",
          WebkitBackdropFilter: "blur(0px)",
        },
        {
          opacity: 1,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
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
      WebkitBackdropFilter: "blur(0px)",
      duration: 0.35,
      ease: "power2.in",
      onComplete: () => {
        setFormOpen(false);
        setName("");
        setLegalName("");
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

    const insertPayload: {
      name: string;
      slug: string;
      legal_name?: string | null;
      organization_id?: string | null;
      owner_id?: string | null;
    } = { name: trimmed, slug: uniqueSlug };
    const trimmedLegal = legalName.trim();
    if (trimmedLegal) insertPayload.legal_name = trimmedLegal;
    if (activeOrg) insertPayload.organization_id = activeOrg.id;
    if (user) insertPayload.owner_id = user.id;

    const { data, error: insertError } = await supabase
      .from("brands")
      .insert(insertPayload)
      .select("id, name, slug, logo_url, legal_name, organization_id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
    } else if (data) {
      setBrands((prev) => [...prev, { ...data, colors: [] }]);
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

  const canSave = name.trim().length > 0 && !!activeOrg && !saving;
  const canCreate = !!user && !!activeOrg;

  return (
    <>
      {canCreate && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          aria-label="Neue Brand anlegen"
          title="Neue Brand anlegen"
          className="fixed left-6 top-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-sm transition hover:scale-105 hover:bg-black/85"
        >
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
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      <section
        id="brands"
        className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6"
      >
        {error && !formOpen && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            Fehler: {error}
          </p>
        )}

        {sessionLoading ? (
          <p className="text-sm text-black/50">Lade …</p>
        ) : !user ? (
          <div className="rounded-2xl border border-dashed border-black/15 bg-white p-8 text-sm text-black/60">
            <p className="text-base font-semibold text-black">
              Brands sind nur für eingeloggte Mitglieder sichtbar.
            </p>
            <p className="mt-1">
              Bitte{" "}
              <a
                href="/login"
                className="font-semibold text-black underline decoration-dotted underline-offset-4 hover:decoration-solid"
              >
                logge dich ein
              </a>{" "}
              oder{" "}
              <a
                href="/register"
                className="font-semibold text-black underline decoration-dotted underline-offset-4 hover:decoration-solid"
              >
                registriere dich
              </a>
              , um die Brands deiner Organisation zu sehen.
            </p>
          </div>
        ) : !activeOrg ? (
          <div className="rounded-2xl border border-dashed border-black/15 bg-white p-8 text-sm text-black/60">
            <p className="text-base font-semibold text-black">
              Du gehörst noch keiner Organisation an.
            </p>
            <p className="mt-1">
              Sobald ein Admin oder Verwalter dich einer Organisation
              zuordnet, erscheinen hier die Brands deiner Orga.
            </p>
          </div>
        ) : loading ? (
          <p className="text-sm text-black/50">Lade Brands …</p>
        ) : brands.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {brands.map((brand) => (
              <BrandCard
                key={brand.id}
                name={brand.name}
                slug={brand.slug}
                logoUrl={brand.logo_url}
                colors={brand.colors}
                legalName={brand.legal_name}
                onDelete={() => setPendingDelete(brand)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-black/50">
            Noch keine Brands in <strong>B. {activeOrg.name}</strong>. Lege die
            erste mit dem <kbd className="rounded bg-black/5 px-1 py-0.5 text-[11px]">+</kbd>{" "}
            oben links an.
          </p>
        )}
      </section>

      {formOpen && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label="Neue Brand anlegen"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
          style={{
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
          onClick={() => closeForm()}
        >
          <div
            ref={panelRef}
            className="w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label htmlFor="brand-name-overlay" className="sr-only">
                Brandname
              </label>
              <div className="flex items-end gap-6 border-b-2 border-white/70 px-2 pb-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <input
                    ref={inputRef}
                    id="brand-name-overlay"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Brandname …"
                    disabled={saving}
                    autoComplete="off"
                    className="min-w-0 flex-1 border-0 bg-transparent font-semibold tracking-tight text-white placeholder:text-white/40 outline-none focus:outline-none focus:ring-0 disabled:opacity-60"
                    style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)" }}
                  />
                  <input
                    type="text"
                    value={legalName}
                    onChange={(event) => setLegalName(event.target.value)}
                    placeholder="Firmierung (optional, z.B. Max Mustermann GmbH)"
                    disabled={saving}
                    autoComplete="off"
                    className="min-w-0 border-0 bg-transparent text-base text-white/70 placeholder:text-white/30 outline-none focus:outline-none focus:ring-0 disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSave}
                  className="mb-2 shrink-0 rounded-full bg-white px-8 py-4 text-lg font-semibold text-black transition enabled:hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Speichert …" : "Anlegen"}
                </button>
              </div>
              {activeOrg ? (
                <p className="px-2 text-xs text-white/60">
                  Brand wird in <strong className="text-white">B. {activeOrg.name}</strong>{" "}
                  angelegt.
                </p>
              ) : !user ? (
                <p className="px-2 text-xs text-white/60">
                  Du bist nicht eingeloggt – die Brand wird ohne Organisation
                  gespeichert.
                </p>
              ) : null}
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
