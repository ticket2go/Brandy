"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";

import {
  generateIdmlPackage,
  suggestIdmlPackageFilename,
  type IdmlColorInput,
  type IdmlPackageFont,
  type IdmlPageSize,
  type IdmlTypographyRole,
} from "@/lib/generateIdml";

import BrandRoles from "./BrandRoles";
import ColorsPanel from "./ColorsPanel";
import LogokitPanel from "./LogokitPanel";
import LokalPanel from "./LokalPanel";
import PresentationPanel from "./PresentationPanel";
import TypographyPanel from "./TypographyPanel";
import {
  CreativeCloudIcon,
  FigmaIcon,
  IndesignIcon,
  WebExportsIcon,
} from "./ExportIcons";
import IdmlExportModal from "./IdmlExportModal";
import { useSession } from "./SessionProvider";

type Brand = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  legal_name: string | null;
  organization_id: string | null;
};

type TabKey =
  | "logokit"
  | "farben"
  | "typografie"
  | "elemente"
  | "digital"
  | "praesentation"
  | "lokal";

const TABS: { key: TabKey; label: string }[] = [
  { key: "logokit", label: "Logokit" },
  { key: "farben", label: "Farben" },
  { key: "typografie", label: "Typografie" },
  { key: "elemente", label: "Elemente" },
  { key: "digital", label: "Digital" },
  { key: "praesentation", label: "Präsentation" },
  { key: "lokal", label: "Lokal" },
];

const STORAGE_BUCKET = "brand-assets";

type BrandDetailProps = {
  slug: string;
};

export default function BrandDetail({ slug }: BrandDetailProps) {
  const { user, profile, memberships } = useSession();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("logokit");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [editingLegalName, setEditingLegalName] = useState(false);
  const [legalNameDraft, setLegalNameDraft] = useState("");
  const [savingLegalName, setSavingLegalName] = useState(false);
  const legalNameInputRef = useRef<HTMLInputElement | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [exportingIdml, setExportingIdml] = useState(false);
  const [idmlModalOpen, setIdmlModalOpen] = useState(false);
  const [tabContent, setTabContent] = useState<Record<TabKey, boolean>>({
    logokit: false,
    farben: false,
    typografie: false,
    elemente: false,
    digital: false,
    praesentation: false,
    lokal: false,
  });

  const brandRef = useRef<Brand | null>(null);
  useEffect(() => {
    brandRef.current = brand;
  }, [brand]);

  const loadBrand = useCallback(async () => {
    // Bei einem Hintergrund-Refresh (Tab-Wechsel) bleibt die bestehende
    // Brand sichtbar, statt die ganze Seite auf "Lade Brand …"
    // zurückzuwerfen.
    if (!brandRef.current) {
      setLoading(true);
    }
    setError(null);

    // Safety: Supabase-Queries können nach längerer Idle hängen
    // (siehe lib/supabase/client.ts). Wir geben dem Lauf max. 12s.
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      window.setTimeout(() => resolve("timeout"), 12000)
    );
    try {
      const query = supabase
        .from("brands")
        .select("id, name, slug, logo_url, legal_name, organization_id")
        .eq("slug", slug)
        .maybeSingle();
      const result = await Promise.race([query, timeoutPromise]);
      if (result === "timeout") {
        // Wenn schon eine Brand geladen war, einfach still bleiben –
        // sonst Fehlermeldung anzeigen.
        if (!brandRef.current) {
          setError(
            "Brand konnte nicht geladen werden (Timeout). Bitte aktualisiere die Seite."
          );
        }
        return;
      }
      const { data, error: loadError } = result;
      if (loadError) {
        setError(loadError.message);
        if (!brandRef.current) setBrand(null);
      } else if (!data) {
        setNotFound(true);
        setBrand(null);
      } else {
        setBrand(data);
        setNotFound(false);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[BrandDetail] loadBrand failed", err);
      if (!brandRef.current) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadBrand();
  }, [loadBrand]);

  // Beim Zurückkommen in den Tab still nachladen, damit nichts hängen
  // bleibt, falls die Vorherige Query in einen Auth-Lock-Stall lief.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      loadBrand();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadBrand]);

  useEffect(() => {
    if (!brand) return;
    let cancelled = false;

    const checkContent = async () => {
      const [logosRes, colorsRes, fontsRes, localRes] = await Promise.all([
        supabase
          .from("brand_logos")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id),
        supabase
          .from("brand_colors")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id),
        supabase
          .from("brand_fonts")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id),
        supabase
          .from("brand_local_entries")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id),
      ]);

      if (cancelled) return;

      setTabContent((prev) => ({
        ...prev,
        logokit: (logosRes.count ?? 0) > 0,
        farben: (colorsRes.count ?? 0) > 0,
        typografie: (fontsRes.count ?? 0) > 0,
        lokal: (localRes.count ?? 0) > 0,
      }));
    };

    checkContent();

    return () => {
      cancelled = true;
    };
  }, [brand, activeTab]);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  useEffect(() => {
    if (editingLegalName && legalNameInputRef.current) {
      legalNameInputRef.current.focus();
      legalNameInputRef.current.select();
    }
  }, [editingLegalName]);

  const startEditName = () => {
    if (!brand) return;
    setNameDraft(brand.name);
    setEditingName(true);
  };

  const cancelEditName = () => {
    if (savingName) return;
    setEditingName(false);
    setNameDraft("");
  };

  const commitEditName = async () => {
    if (!brand || savingName) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === brand.name) {
      cancelEditName();
      return;
    }
    setSavingName(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("brands")
      .update({ name: trimmed })
      .eq("id", brand.id)
      .select("id, name, slug, logo_url, legal_name, organization_id")
      .single();
    if (updateError) {
      setError(updateError.message);
      setSavingName(false);
      return;
    }
    if (data) setBrand(data);
    setSavingName(false);
    setEditingName(false);
    setNameDraft("");
  };

  const startEditLegalName = () => {
    if (!brand) return;
    setLegalNameDraft(brand.legal_name ?? "");
    setEditingLegalName(true);
  };

  const cancelEditLegalName = () => {
    if (savingLegalName) return;
    setEditingLegalName(false);
    setLegalNameDraft("");
  };

  const commitEditLegalName = async () => {
    if (!brand || savingLegalName) return;
    const trimmed = legalNameDraft.trim();
    const current = brand.legal_name ?? "";
    if (trimmed === current) {
      cancelEditLegalName();
      return;
    }
    setSavingLegalName(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("brands")
      .update({ legal_name: trimmed.length > 0 ? trimmed : null })
      .eq("id", brand.id)
      .select("id, name, slug, logo_url, legal_name, organization_id")
      .single();
    if (updateError) {
      setError(updateError.message);
      setSavingLegalName(false);
      return;
    }
    if (data) setBrand(data);
    setSavingLegalName(false);
    setEditingLegalName(false);
    setLegalNameDraft("");
  };

  const logoSrc = useMemo(() => {
    if (!brand?.logo_url) return null;
    if (brand.logo_url.startsWith("http")) return brand.logo_url;
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(brand.logo_url);
    return data.publicUrl;
  }, [brand?.logo_url]);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !brand) return;

    setUploading(true);
    setError(null);

    const extension = file.name.split(".").pop() || "png";
    const path = `${brand.slug}/logo-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const { error: updateError } = await supabase
      .from("brands")
      .update({ logo_url: path })
      .eq("id", brand.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setBrand((prev) => (prev ? { ...prev, logo_url: path } : prev));
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(false);
  };

  const runIdmlExport = useCallback(
    async (pageSize: IdmlPageSize) => {
      if (!brand || exportingIdml) return;
      setExportingIdml(true);
      setError(null);
      try {
        const [colorsRes, fontsRes, fontFilesRes] = await Promise.all([
          supabase
            .from("brand_colors")
            .select("id, group, name, hex, position")
            .eq("brand_id", brand.id)
            .order("position", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("brand_fonts")
            .select(
              "id, family, source, roles, position, created_at"
            )
            .eq("brand_id", brand.id)
            .order("position", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("brand_font_files")
            .select(
              "id, font_id, variant, weight, italic, format, storage_path"
            ),
        ]);

        if (colorsRes.error) {
          setError(colorsRes.error.message);
          return;
        }
        if (fontsRes.error) {
          setError(fontsRes.error.message);
          return;
        }
        if (fontFilesRes.error) {
          setError(fontFilesRes.error.message);
          return;
        }

        const colorRows = (colorsRes.data ?? []) as Array<{
          id: string;
          group: "print" | "digital";
          name: string;
          hex: string;
          position: number;
        }>;

        if (colorRows.length === 0) {
          setError(
            "Keine Farben hinterlegt – lege zuerst Print- oder Digital-Farben an."
          );
          return;
        }

        const colors: IdmlColorInput[] = colorRows.map((row) => ({
          name: row.name,
          hex: row.hex,
          group: row.group,
        }));

        const fontRows = (fontsRes.data ?? []) as Array<{
          id: string;
          family: string;
          source: "google" | "custom";
          roles: string[] | null;
          position: number;
        }>;
        const fontFileRows = (fontFilesRes.data ?? []) as Array<{
          id: string;
          font_id: string;
          variant: string;
          weight: number;
          italic: boolean;
          format: string;
          storage_path: string;
        }>;

        // Rollen-Reihenfolge wie im Panel, damit Headline zuerst und
        // Monospace zuletzt ausgegeben wird.
        const ROLE_ORDER = [
          "headline",
          "subline",
          "overline",
          "copy",
          "caption",
          "quote",
          "monospace",
        ];

        type RoleMeta = {
          key: string;
          label: string;
          sample: string;
          pointSize: number;
          weight?: number;
          italic?: boolean;
          uppercase?: boolean;
          letterSpacing?: number;
        };
        const roleDefaults: Record<string, RoleMeta> = {
          headline: {
            key: "headline",
            label: "Headline",
            sample: "Headline – The quick brown fox",
            pointSize: 34,
            weight: 700,
          },
          subline: {
            key: "subline",
            label: "Subline",
            sample: "Subline – jumps over the lazy dog",
            pointSize: 22,
            weight: 600,
          },
          overline: {
            key: "overline",
            label: "Overline",
            sample: "Overline",
            pointSize: 10,
            weight: 600,
            uppercase: true,
            letterSpacing: 200,
          },
          copy: {
            key: "copy",
            label: "Copy",
            sample:
              "Copy – Der schnelle braune Fuchs springt ueber den faulen Hund.",
            pointSize: 11,
            weight: 400,
          },
          caption: {
            key: "caption",
            label: "Caption",
            sample: "Caption – Beschreibung oder Bildunterschrift.",
            pointSize: 9,
            weight: 400,
          },
          quote: {
            key: "quote",
            label: "Quote",
            sample: "\u201COutstanding work is never an accident.\u201D",
            pointSize: 14,
            weight: 400,
            italic: true,
          },
          monospace: {
            key: "monospace",
            label: "Monospace",
            sample: "const hello = \"world\";",
            pointSize: 10,
            weight: 400,
          },
        };

        type TypographyAssignment = {
          role: RoleMeta;
          family: string;
          fontId: string;
        };
        const typographyAssignments: TypographyAssignment[] = [];
        for (const roleKey of ROLE_ORDER) {
          const match = fontRows.find((f) =>
            Array.isArray(f.roles) ? f.roles.includes(roleKey) : false
          );
          if (!match) continue;
          const meta = roleDefaults[roleKey];
          if (!meta) continue;
          typographyAssignments.push({
            role: meta,
            family: match.family,
            fontId: match.id,
          });
        }

        const typography: IdmlTypographyRole[] = typographyAssignments.map(
          (entry) => ({
            key: entry.role.key,
            label: entry.role.label,
            family: entry.family,
            sampleText: entry.role.sample,
            pointSize: entry.role.pointSize,
            weight: entry.role.weight,
            italic: entry.role.italic,
            uppercase: entry.role.uppercase,
            letterSpacing: entry.role.letterSpacing,
          })
        );

        // Font-Dateien zusammentragen: alle Schriftfamilien, die per Rolle
        // verwendet werden. Fuer jede Familie ALLE hinterlegten Dateien
        // beilegen - allerdings OHNE woff (weder woff noch woff2 sind fuer
        // InDesign relevant; ttf/otf werden bevorzugt).
        const usedFontIds = new Set<string>(
          typographyAssignments.map((t) => t.fontId)
        );
        // Zusaetzlich die Fonts ohne Rolle, aber mit Dateien, nicht mitnehmen,
        // um das Paket klein zu halten. Falls der User das ZIP trotzdem als
        // "Alle Fonts" moechte, koennten wir spaeter einen Schalter einbauen.

        const fontsForPackage: IdmlPackageFont[] = [];
        for (const fontRow of fontRows) {
          if (!usedFontIds.has(fontRow.id)) continue;
          const files = fontFileRows.filter(
            (f) => f.font_id === fontRow.id && f.format !== "woff" && f.format !== "woff2"
          );
          if (files.length === 0) continue;
          const downloaded = await Promise.all(
            files.map(async (file) => {
              const { data } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(file.storage_path);
              const response = await fetch(data.publicUrl);
              if (!response.ok) {
                throw new Error(
                  `Schriftdatei konnte nicht geladen werden (${response.status}).`
                );
              }
              const buffer = await response.arrayBuffer();
              const suffix = file.italic ? "Italic" : "";
              const weightName =
                file.weight === 400
                  ? suffix
                    ? ""
                    : "Regular"
                  : String(file.weight);
              const baseName = [
                fontRow.family.replace(/\s+/g, ""),
                weightName,
                suffix,
              ]
                .filter(Boolean)
                .join("-");
              return {
                name: `${baseName || fontRow.family.replace(/\s+/g, "") + "-" + file.variant}.${file.format}`,
                data: buffer,
              };
            })
          );
          fontsForPackage.push({
            family: fontRow.family,
            files: downloaded,
          });
        }

        const blob = await generateIdmlPackage({
          brandName: brand.name,
          colors,
          typography,
          pageSize,
          fonts: fontsForPackage,
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = suggestIdmlPackageFilename(brand.name);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setIdmlModalOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setExportingIdml(false);
      }
    },
    [brand, exportingIdml]
  );

  const handleOpenIdmlModal = useCallback(() => {
    if (!brand || exportingIdml) return;
    setIdmlModalOpen(true);
  }, [brand, exportingIdml]);

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6">
        <p className="text-sm text-black/50">Lade Brand …</p>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6">
        <h1 className="text-3xl font-semibold text-black">Brand nicht gefunden</h1>
        <p className="text-sm text-black/60">
          Die Brand „{slug}“ existiert nicht (mehr).
        </p>
        <Link
          href="/brandy"
          className="w-fit rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-black/85"
        >
          Zur Startseite
        </Link>
      </section>
    );
  }

  if (!brand) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            Fehler: {error}
          </p>
        )}
      </section>
    );
  }

  // Bearbeiten erlaubt: Admin global, oder Brand ohne Organisation
  // (Legacy-Brands aus der anonymen Phase), oder Mitglied/Manager der
  // Organisation, der die Brand zugeordnet ist.
  const canEdit =
    !!user &&
    (profile?.is_admin === true ||
      brand.organization_id === null ||
      memberships.some(
        (m) => m.organization_id === brand.organization_id
      ));

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6">
      <header className="flex flex-col gap-4">
        <nav className="flex items-center gap-2 text-xs uppercase tracking-widest text-black/40">
          <Link href="/brandy" className="hover:text-black">
            Brands
          </Link>
          <span>/</span>
          <span className="text-black/70">{brand.name}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditMode((prev) => {
                  const next = !prev;
                  if (!next) {
                    if (editingName && !savingName) cancelEditName();
                    if (editingLegalName && !savingLegalName)
                      cancelEditLegalName();
                  }
                  return next;
                });
              }}
              aria-pressed={editMode}
              aria-label={editMode ? "Bearbeiten beenden" : "Brand bearbeiten"}
              title={editMode ? "Bearbeiten beenden" : "Brand bearbeiten"}
              className={`ml-auto flex h-7 w-7 items-center justify-center rounded-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 ${
                editMode
                  ? "bg-black text-white hover:bg-black/85"
                  : "text-black/60 hover:bg-black/10 hover:text-black"
              }`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9.5 2.2l2.3 2.3M2.5 11.5L3 9l6.5-6.5a1.2 1.2 0 0 1 1.7 0l.3.3a1.2 1.2 0 0 1 0 1.7L5 11l-2.5.5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </nav>
        <div className="flex items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-start gap-2">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={commitEditName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitEditName();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEditName();
                    }
                  }}
                  disabled={savingName}
                  aria-label="Brand-Name bearbeiten"
                  className="m-0 min-w-0 rounded-md border border-black/15 bg-white px-2 py-1 font-bold text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
                  style={{
                    fontSize: "clamp(2rem, 6vw, 4rem)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.05,
                  }}
                />
              ) : (
                <>
                  <h1
                    className={`m-0 font-bold text-black ${
                      editMode ? "brand-jiggle" : ""
                    }`}
                    style={{
                      fontSize: "clamp(2rem, 6vw, 4rem)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {brand.name}
                  </h1>
                  {editMode && (
                    <button
                      type="button"
                      onClick={startEditName}
                      aria-label="Brand-Name bearbeiten"
                      title="Namen bearbeiten"
                      className="mt-2 flex h-7 w-7 items-center justify-center rounded-md text-black/30 transition hover:bg-black/5 hover:text-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M9.5 2.2l2.3 2.3M2.5 11.5L3 9l6.5-6.5a1.2 1.2 0 0 1 1.7 0l.3.3a1.2 1.2 0 0 1 0 1.7L5 11l-2.5.5z"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
            {(brand.legal_name && brand.legal_name.length > 0) ||
            editMode ||
            editingLegalName ? (
              <div className="group flex min-w-0 items-center gap-1.5 pl-1">
                {editingLegalName ? (
                  <input
                    ref={legalNameInputRef}
                    type="text"
                    value={legalNameDraft}
                    onChange={(event) => setLegalNameDraft(event.target.value)}
                    onBlur={commitEditLegalName}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitEditLegalName();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelEditLegalName();
                      }
                    }}
                    disabled={savingLegalName}
                    placeholder="Firmierung (z.B. Max Mustermann GmbH)"
                    aria-label="Firmierung bearbeiten"
                    className="m-0 min-w-0 rounded-md border border-black/15 bg-white px-2 py-1 text-sm text-black/80 outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
                  />
                ) : (
                  <>
                    <span
                      className={`truncate text-sm text-black/55 ${
                        editMode ? "brand-jiggle-alt" : ""
                      }`}
                      title={brand.legal_name ?? "Firmierung hinzufügen"}
                    >
                      {brand.legal_name && brand.legal_name.length > 0
                        ? brand.legal_name
                        : "Firmierung hinzufügen"}
                    </span>
                    {editMode && (
                      <button
                        type="button"
                        onClick={startEditLegalName}
                        aria-label="Firmierung bearbeiten"
                        title="Firmierung bearbeiten"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-black/30 transition hover:bg-black/5 hover:text-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 14 14"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M9.5 2.2l2.3 2.3M2.5 11.5L3 9l6.5-6.5a1.2 1.2 0 0 1 1.7 0l.3.3a1.2 1.2 0 0 1 0 1.7L5 11l-2.5.5z"
                            stroke="currentColor"
                            strokeWidth="1.25"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
            {logoSrc ? (
              <div className={`relative ${editMode ? "brand-jiggle" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoSrc}
                  alt={`${brand.name} Logo`}
                  className="h-14 w-14 rounded-xl border border-black/10 bg-white object-contain p-2"
                />
                {(editMode || uploading) && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Logo ändern"
                  title={uploading ? "Lädt hoch …" : "Logo ändern"}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-white text-black/40 shadow-sm transition hover:text-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? (
                    <span
                      className="h-3 w-3 animate-spin rounded-full border-2 border-black/20 border-t-black/70"
                      aria-hidden
                    />
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M9.5 2.2l2.3 2.3M2.5 11.5L3 9l6.5-6.5a1.2 1.2 0 0 1 1.7 0l.3.3a1.2 1.2 0 0 1 0 1.7L5 11l-2.5.5z"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? "Lädt hoch …" : "Logo hochladen"}
              </button>
            )}
          </div>
        </div>
        <BrandRoles />
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Fehler: {error}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-black/10">
        <div role="tablist" className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            const hasContent = tabContent[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`-mb-px inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-black text-black"
                    : "border-transparent text-black/50 hover:text-black"
                }`}
                aria-selected={isActive}
                role="tab"
              >
                <span>{tab.label}</span>
                {hasContent && (
                  <span
                    aria-label="Inhalte vorhanden"
                    title="Inhalte vorhanden"
                    className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"
                  >
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.5 6.2L4.8 8.5L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2 pb-2 pl-2 text-xs text-black/50">
          <span className="font-medium uppercase tracking-wider">Export:</span>
          <button
            type="button"
            onClick={handleOpenIdmlModal}
            disabled={exportingIdml}
            aria-label="Farben als Adobe InDesign (.idml) exportieren"
            title={
              exportingIdml
                ? "Erstelle IDML …"
                : "Farben als Adobe InDesign (.idml) exportieren"
            }
            className="flex h-6 w-6 items-center justify-center rounded-md transition hover:scale-110 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportingIdml ? (
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black"
                aria-hidden
              />
            ) : (
              <IndesignIcon className="h-5 w-5" />
            )}
          </button>
          <button
            type="button"
            aria-label="Export nach Figma"
            title="Export nach Figma"
            className="flex h-6 w-6 items-center justify-center rounded-md transition hover:scale-110 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >
            <FigmaIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Export in Adobe Creative Cloud"
            title="Export in Adobe Creative Cloud"
            className="flex h-6 w-6 items-center justify-center rounded-md transition hover:scale-110 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >
            <CreativeCloudIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Web Exports"
            title="Web Exports"
            className="flex h-6 w-6 items-center justify-center rounded-md transition hover:scale-110 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >
            <WebExportsIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div role="tabpanel" className="min-h-[300px]">
        <TabFade tabKey={activeTab}>
          {activeTab === "logokit" && (
            <LogokitPanel
              brandId={brand.id}
              brandSlug={brand.slug}
              brandName={brand.name}
            />
          )}
          {activeTab === "farben" && (
            <ColorsPanel brandId={brand.id} brandName={brand.name} />
          )}
          {activeTab === "typografie" && (
            <TypographyPanel brandId={brand.id} brandSlug={brand.slug} />
          )}
          {activeTab === "elemente" && <PlaceholderPanel title="Elemente" />}
          {activeTab === "digital" && <PlaceholderPanel title="Digital" />}
          {activeTab === "praesentation" && (
            <PresentationPanel
              brandId={brand.id}
              brandName={brand.name}
              legalName={brand.legal_name}
              organizationId={brand.organization_id}
            />
          )}
          {activeTab === "lokal" && (
            <LokalPanel
              brandId={brand.id}
              onCountChange={(count) => {
                const has = count > 0;
                setTabContent((prev) =>
                  prev.lokal === has ? prev : { ...prev, lokal: has }
                );
              }}
            />
          )}
        </TabFade>
      </div>

      <IdmlExportModal
        open={idmlModalOpen}
        onClose={() => {
          if (!exportingIdml) setIdmlModalOpen(false);
        }}
        onConfirm={(pageSize) => runIdmlExport(pageSize)}
        busy={exportingIdml}
      />
    </section>
  );
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-white p-10">
      <h3 className="text-lg font-semibold text-black">{title}</h3>
      <p className="mt-2 text-sm text-black/50">
        Inhalte für „{title}“ folgen in Kürze.
      </p>
    </div>
  );
}

function TabFade({
  tabKey,
  children,
}: {
  tabKey: string;
  children: React.ReactNode;
}) {
  const [visibleKey, setVisibleKey] = useState(tabKey);
  const [displayed, setDisplayed] = useState(children);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (tabKey === visibleKey) {
      setDisplayed(children);
      return;
    }
    setFading(true);
    const timeout = window.setTimeout(() => {
      setDisplayed(children);
      setVisibleKey(tabKey);
      setFading(false);
    }, 180);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey, children]);

  return (
    <div
      key={visibleKey}
      className="transition-opacity duration-300 ease-out"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {displayed}
    </div>
  );
}
