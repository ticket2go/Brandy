"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";

import BrandRoles from "./BrandRoles";
import ColorsPanel from "./ColorsPanel";

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
          <h1
            className="m-0 font-bold text-black"
            style={{
              fontSize: "clamp(2rem, 6vw, 4rem)",
              letterSpacing: "-0.02em",
            }}
          >
            {brand.name}
          </h1>
          <div className="flex items-center gap-4">
            {logoSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt={`${brand.name} Logo`}
                className="h-14 w-14 rounded-xl border border-black/10 bg-white object-contain p-2"
              />
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={uploading}
                className="hidden"
              />
              {uploading ? "Lädt hoch …" : "Logo hochladen"}
            </label>
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

      <div className="flex flex-wrap gap-2 border-b border-black/10">
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

      <div role="tabpanel" className="min-h-[300px]">
        <TabFade tabKey={activeTab}>
          {activeTab === "logokit" && (
            <LogokitPanel logoSrc={logoSrc} brandName={brand.name} />
          )}
          {activeTab === "farben" && <ColorsPanel brandName={brand.name} />}
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
