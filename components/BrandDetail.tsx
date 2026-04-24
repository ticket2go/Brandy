"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";

import {
  generateIdml,
  suggestIdmlFilename,
  type IdmlColorInput,
  type IdmlPageSize,
} from "@/lib/generateIdml";

import BrandRoles from "./BrandRoles";
import ColorsPanel from "./ColorsPanel";
import {
  CreativeCloudIcon,
  FigmaIcon,
  IndesignIcon,
  WebExportsIcon,
} from "./ExportIcons";
import IdmlExportModal from "./IdmlExportModal";

type Brand = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
};

type TabKey =
  | "logokit"
  | "farben"
  | "typografie"
  | "elemente"
  | "digital"
  | "anwendungsbeispiele";

const TABS: { key: TabKey; label: string }[] = [
  { key: "logokit", label: "Logokit" },
  { key: "farben", label: "Farben" },
  { key: "typografie", label: "Typografie" },
  { key: "elemente", label: "Elemente" },
  { key: "digital", label: "Digital" },
  { key: "anwendungsbeispiele", label: "Anwendungsbeispiele" },
];

const STORAGE_BUCKET = "brand-assets";

type BrandDetailProps = {
  slug: string;
};

export default function BrandDetail({ slug }: BrandDetailProps) {
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
  const [exportingIdml, setExportingIdml] = useState(false);
  const [idmlModalOpen, setIdmlModalOpen] = useState(false);

  const loadBrand = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("brands")
      .select("id, name, slug, logo_url")
      .eq("slug", slug)
      .maybeSingle();

    if (loadError) {
      setError(loadError.message);
      setBrand(null);
    } else if (!data) {
      setNotFound(true);
      setBrand(null);
    } else {
      setBrand(data);
      setNotFound(false);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    loadBrand();
  }, [loadBrand]);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

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
      .select("id, name, slug, logo_url")
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
        const { data, error: loadError } = await supabase
          .from("brand_colors")
          .select("id, group, name, hex, position")
          .eq("brand_id", brand.id)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });

        if (loadError) {
          setError(loadError.message);
          return;
        }

        const rows = (data ?? []) as Array<{
          id: string;
          group: "print" | "digital";
          name: string;
          hex: string;
          position: number;
        }>;

        if (rows.length === 0) {
          setError(
            "Keine Farben hinterlegt – lege zuerst Print- oder Digital-Farben an."
          );
          return;
        }

        const colors: IdmlColorInput[] = rows.map((row) => ({
          name: row.name,
          hex: row.hex,
          group: row.group,
        }));

        const blob = await generateIdml({
          brandName: brand.name,
          colors,
          pageSize,
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = suggestIdmlFilename(brand.name);
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
          href="/"
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

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6">
      <header className="flex flex-col gap-4">
        <nav className="text-xs uppercase tracking-widest text-black/40">
          <Link href="/" className="hover:text-black">
            Brands
          </Link>
          <span className="mx-2">/</span>
          <span className="text-black/70">{brand.name}</span>
        </nav>
        <div className="flex items-end justify-between gap-6">
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
                  className="m-0 font-bold text-black"
                  style={{
                    fontSize: "clamp(2rem, 6vw, 4rem)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {brand.name}
                </h1>
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
              </>
            )}
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
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoSrc}
                  alt={`${brand.name} Logo`}
                  className="h-14 w-14 rounded-xl border border-black/10 bg-white object-contain p-2"
                />
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
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-black text-black"
                    : "border-transparent text-black/50 hover:text-black"
                }`}
                aria-selected={isActive}
                role="tab"
              >
                {tab.label}
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
            <LogokitPanel logoSrc={logoSrc} brandName={brand.name} />
          )}
          {activeTab === "farben" && (
            <ColorsPanel brandId={brand.id} brandName={brand.name} />
          )}
          {activeTab === "typografie" && (
            <PlaceholderPanel title="Typografie" />
          )}
          {activeTab === "elemente" && <PlaceholderPanel title="Elemente" />}
          {activeTab === "digital" && <PlaceholderPanel title="Digital" />}
          {activeTab === "anwendungsbeispiele" && (
            <PlaceholderPanel title="Anwendungsbeispiele" />
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

function LogokitPanel({
  logoSrc,
  brandName,
}: {
  logoSrc: string | null;
  brandName: string;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex aspect-square items-center justify-center rounded-2xl border border-black/10 bg-white p-10">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt={`${brandName} Logo`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="text-sm text-black/40">
            Noch kein Logo hochgeladen. Nutze „Logo hochladen“ oben rechts.
          </p>
        )}
      </div>
      <div className="flex aspect-square items-center justify-center rounded-2xl border border-black/10 bg-black p-10">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt={`${brandName} Logo invertierter Hintergrund`}
            className="max-h-full max-w-full object-contain invert"
          />
        ) : (
          <p className="text-sm text-white/40">Vorschau auf dunklem Grund</p>
        )}
      </div>
    </div>
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
