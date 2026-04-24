"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";

import AddCategoryDialog from "./AddCategoryDialog";
import AddColorDialog from "./AddColorDialog";
import AddColorSwatch from "./AddColorSwatch";
import ColorSwatch, { type ColorSwatchData } from "./ColorSwatch";

type Group = "print" | "digital";

type Category = {
  id: string;
  group: Group;
  key: string;
  label: string;
  position: number;
};

type Color = {
  id: string;
  group: Group;
  name: string;
  hex: string;
  position: number;
};

type ColorValue = {
  id: string;
  color_id: string;
  category_id: string;
  value: string;
};

type ColorsPanelProps = {
  brandId: string;
  brandName: string;
};

function formatRgb(hex: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `RGB ${r}, ${g}, ${b}`;
}

function defaultValueFor(category: Category, color: Color): string {
  const key = category.key.toLowerCase();
  if (key === "hex") return color.hex.toUpperCase();
  if (key === "rgb") return formatRgb(color.hex);
  return color.hex.toUpperCase();
}

export default function ColorsPanel({ brandId, brandName }: ColorsPanelProps) {
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [colors, setColors] = useState<Color[]>([]);
  const [values, setValues] = useState<ColorValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<Record<Group, string | null>>(
    { print: null, digital: null }
  );

  const [addColorGroup, setAddColorGroup] = useState<Group | null>(null);
  const [addCategoryGroup, setAddCategoryGroup] = useState<Group | null>(null);

  const overlayRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [catsRes, colorsRes, valuesRes] = await Promise.all([
      supabase
        .from("brand_color_categories")
        .select("id, brand_id, group, key, label, position")
        .eq("brand_id", brandId)
        .order("group", { ascending: true })
        .order("position", { ascending: true }),
      supabase
        .from("brand_colors")
        .select("id, brand_id, group, name, hex, position")
        .eq("brand_id", brandId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("brand_color_values")
        .select("id, color_id, category_id, value"),
    ]);

    if (catsRes.error) {
      setError(catsRes.error.message);
    } else if (colorsRes.error) {
      setError(colorsRes.error.message);
    } else if (valuesRes.error) {
      setError(valuesRes.error.message);
    } else {
      const cats = (catsRes.data ?? []) as Category[];
      setCategories(cats);
      setColors((colorsRes.data ?? []) as Color[]);
      const colorIds = new Set((colorsRes.data ?? []).map((c) => c.id));
      setValues(
        ((valuesRes.data ?? []) as ColorValue[]).filter((v) =>
          colorIds.has(v.color_id)
        )
      );

      setActiveFilter((prev) => {
        const next: Record<Group, string | null> = { ...prev };
        for (const group of ["print", "digital"] as Group[]) {
          const groupCats = cats
            .filter((c) => c.group === group)
            .sort((a, b) => a.position - b.position);
          const current = prev[group];
          if (!current || !groupCats.find((c) => c.id === current)) {
            next[group] = groupCats[0]?.id ?? null;
          }
        }
        return next;
      });
    }
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !overlayRef.current) return;
      gsap.to(overlayRef.current, {
        opacity: hoveredColor ? 1 : 0,
        duration: 0.55,
        ease: "power2.out",
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [hoveredColor]);

  const valuesByColor = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const v of values) {
      if (!map.has(v.color_id)) map.set(v.color_id, new Map());
      map.get(v.color_id)!.set(v.category_id, v.value);
    }
    return map;
  }, [values]);

  const handleAddCategory = async (payload: { label: string; key: string }) => {
    if (!addCategoryGroup) return;
    const group = addCategoryGroup;
    const existingKeys = categories
      .filter((c) => c.group === group)
      .map((c) => c.key);
    let uniqueKey = payload.key;
    let suffix = 2;
    while (existingKeys.includes(uniqueKey)) {
      uniqueKey = `${payload.key}-${suffix}`;
      suffix += 1;
    }
    const nextPosition =
      (categories
        .filter((c) => c.group === group)
        .reduce((max, c) => Math.max(max, c.position), -1) || 0) + 1;

    const { data, error: insertError } = await supabase
      .from("brand_color_categories")
      .insert({
        brand_id: brandId,
        group,
        key: uniqueKey,
        label: payload.label,
        position: nextPosition,
      })
      .select("id, brand_id, group, key, label, position")
      .single();

    if (insertError) throw new Error(insertError.message);
    if (data) {
      const created = data as Category;
      setCategories((prev) => [...prev, created]);
      setActiveFilter((prev) => ({ ...prev, [group]: created.id }));
    }
  };

  const handleAddColor = async (payload: {
    name: string;
    hex: string;
    values: Record<string, string>;
  }) => {
    if (!addColorGroup) return;
    const group = addColorGroup;
    const nextPosition =
      (colors
        .filter((c) => c.group === group)
        .reduce((max, c) => Math.max(max, c.position), -1) || 0) + 1;

    const { data: colorData, error: colorError } = await supabase
      .from("brand_colors")
      .insert({
        brand_id: brandId,
        group,
        name: payload.name,
        hex: payload.hex,
        position: nextPosition,
      })
      .select("id, brand_id, group, name, hex, position")
      .single();

    if (colorError) throw new Error(colorError.message);
    if (!colorData) return;

    const createdColor = colorData as Color;
    const valueRows = Object.entries(payload.values)
      .filter(([, val]) => val.trim().length > 0)
      .map(([categoryId, val]) => ({
        color_id: createdColor.id,
        category_id: categoryId,
        value: val.trim(),
      }));

    let insertedValues: ColorValue[] = [];
    if (valueRows.length > 0) {
      const { data: valueData, error: valueError } = await supabase
        .from("brand_color_values")
        .insert(valueRows)
        .select("id, color_id, category_id, value");
      if (valueError) throw new Error(valueError.message);
      insertedValues = (valueData ?? []) as ColorValue[];
    }

    setColors((prev) => [...prev, createdColor]);
    setValues((prev) => [...prev, ...insertedValues]);
  };

  return (
    <>
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-30 opacity-0"
        style={{
          backgroundColor: hoveredColor ? `${hoveredColor}CC` : "transparent",
          backdropFilter: "blur(14px) saturate(1.1)",
          WebkitBackdropFilter: "blur(14px) saturate(1.1)",
          transition:
            "background-color 500ms ease, backdrop-filter 500ms ease",
        }}
      />

      <div className="relative z-40 flex flex-col gap-10">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            Fehler: {error}
          </p>
        )}

        {(["print", "digital"] as Group[]).map((group) => {
          const groupCategories = categories
            .filter((c) => c.group === group)
            .sort((a, b) => a.position - b.position);
          const groupColors = colors
            .filter((c) => c.group === group)
            .sort((a, b) => a.position - b.position);
          const activeCategoryId = activeFilter[group];
          const activeCategory =
            groupCategories.find((c) => c.id === activeCategoryId) ?? null;

          const swatchData: ColorSwatchData[] = activeCategory
            ? groupColors.map((color) => {
                const stored = valuesByColor
                  .get(color.id)
                  ?.get(activeCategory.id);
                const value = stored ?? defaultValueFor(activeCategory, color);
                return {
                  name: color.name,
                  hex: color.hex,
                  code: value,
                  codeLabel: activeCategory.label,
                };
              })
            : [];

          return (
            <section key={group} className="flex flex-col gap-5">
              <header className="flex items-baseline justify-between gap-4">
                <h3 className="text-xl font-semibold tracking-tight text-black">
                  {group === "print" ? "Print" : "Digital"}
                </h3>
                <span className="text-xs uppercase tracking-widest text-black/40">
                  {brandName}
                </span>
              </header>

              <div
                role="tablist"
                aria-label={`${group}-Farbsystem`}
                className="flex flex-wrap items-center gap-2"
              >
                {groupCategories.map((cat) => {
                  const isActive = cat.id === activeCategoryId;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() =>
                        setActiveFilter((prev) => ({
                          ...prev,
                          [group]: cat.id,
                        }))
                      }
                      className={`rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-widest transition ${
                        isActive
                          ? "bg-black text-white"
                          : "bg-black/85 text-white/70 hover:bg-black hover:text-white"
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setAddCategoryGroup(group)}
                  aria-label="Neue Kategorie hinzufügen"
                  title="Neue Kategorie"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-black/30 bg-transparent text-black/40 transition hover:border-black/60 hover:text-black"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 2v8M2 6h8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="flex flex-wrap gap-4">
                {!loading &&
                  swatchData.map((color) => (
                    <ColorSwatch
                      key={`${group}-${activeCategoryId}-${color.hex}-${color.name}`}
                      {...color}
                      onHoverChange={setHoveredColor}
                      onEdit={() => {
                        // TODO: Farbe bearbeiten
                      }}
                    />
                  ))}
                {!loading && (
                  <AddColorSwatch onAdd={() => setAddColorGroup(group)} />
                )}
                {loading && (
                  <p className="text-sm text-black/50">Lade Farben …</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <AddCategoryDialog
        open={addCategoryGroup !== null}
        group={addCategoryGroup ?? "print"}
        onClose={() => setAddCategoryGroup(null)}
        onSubmit={handleAddCategory}
      />

      <AddColorDialog
        open={addColorGroup !== null}
        group={addColorGroup ?? "print"}
        categories={categories
          .filter((c) => c.group === addColorGroup)
          .sort((a, b) => a.position - b.position)
          .map((c) => ({ id: c.id, label: c.label }))}
        onClose={() => setAddColorGroup(null)}
        onSubmit={handleAddColor}
      />
    </>
  );
}
