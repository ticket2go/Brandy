"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ColorSwatch, { type ColorSwatchData } from "./ColorSwatch";

type ColorsPanelProps = {
  brandName: string;
};

type PrintFilter = "cmyk" | "pantone" | "weitere";

type PrintColor = {
  name: string;
  hex: string;
  cmyk: string;
  pantone?: string;
  weitere?: { label: string; value: string };
};

const PRINT_COLORS: PrintColor[] = [
  {
    name: "Swoosh Black",
    hex: "#111111",
    cmyk: "C0 M0 Y0 K100",
    pantone: "Pantone Black 6 C",
    weitere: { label: "HKS", value: "HKS 88 N" },
  },
  {
    name: "Off-White",
    hex: "#F5F2EA",
    cmyk: "C2 M3 Y8 K0",
    pantone: "Pantone 11-0601 TCX",
    weitere: { label: "RAL", value: "RAL 9010" },
  },
  {
    name: "Volt",
    hex: "#E4FF1A",
    cmyk: "C15 M0 Y95 K0",
    pantone: "Pantone 388 C",
  },
  {
    name: "University Red",
    hex: "#C8102E",
    cmyk: "C0 M100 Y85 K10",
    pantone: "Pantone 186 C",
    weitere: { label: "HKS", value: "HKS 14" },
  },
  {
    name: "Royal Blue",
    hex: "#1D3FA5",
    cmyk: "C100 M80 Y0 K20",
    pantone: "Pantone 286 C",
  },
];

const DIGITAL_COLORS: ColorSwatchData[] = [
  { name: "Ink", codeLabel: "HEX", code: "#111111", hex: "#111111" },
  { name: "Paper", codeLabel: "HEX", code: "#FAFAFA", hex: "#FAFAFA" },
  { name: "Signal", codeLabel: "HEX", code: "#E4FF1A", hex: "#E4FF1A" },
  { name: "Accent Red", codeLabel: "HEX", code: "#EF4444", hex: "#EF4444" },
  { name: "Accent Blue", codeLabel: "HEX", code: "#2563EB", hex: "#2563EB" },
  { name: "Accent Mint", codeLabel: "HEX", code: "#10B981", hex: "#10B981" },
];

const PRINT_FILTERS: { key: PrintFilter; label: string }[] = [
  { key: "cmyk", label: "CMYK" },
  { key: "pantone", label: "Pantone" },
  { key: "weitere", label: "Weitere" },
];

function mapPrintColor(
  color: PrintColor,
  filter: PrintFilter
): ColorSwatchData | null {
  if (filter === "cmyk") {
    return {
      name: color.name,
      hex: color.hex,
      code: color.cmyk,
      codeLabel: "CMYK",
    };
  }
  if (filter === "pantone") {
    if (!color.pantone) return null;
    return {
      name: color.name,
      hex: color.hex,
      code: color.pantone,
      codeLabel: "Pantone",
    };
  }
  if (!color.weitere) return null;
  return {
    name: color.name,
    hex: color.hex,
    code: color.weitere.value,
    codeLabel: color.weitere.label,
  };
}

export default function ColorsPanel({ brandName }: ColorsPanelProps) {
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);
  const [printFilter, setPrintFilter] = useState<PrintFilter>("cmyk");
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const visiblePrintColors = useMemo(() => {
    return PRINT_COLORS.map((color) => mapPrintColor(color, printFilter)).filter(
      (entry): entry is ColorSwatchData => entry !== null
    );
  }, [printFilter]);

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

  return (
    <>
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-30 opacity-0"
        style={{
          backgroundColor: hoveredColor
            ? `${hoveredColor}CC`
            : "transparent",
          backdropFilter: "blur(14px) saturate(1.1)",
          WebkitBackdropFilter: "blur(14px) saturate(1.1)",
          transition:
            "background-color 500ms ease, backdrop-filter 500ms ease",
        }}
      />

      <div className="relative z-40 flex flex-col gap-10">
        <section className="flex flex-col gap-5">
          <header className="flex items-baseline justify-between gap-4">
            <h3 className="text-xl font-semibold tracking-tight text-black">
              Print
            </h3>
            <span className="text-xs uppercase tracking-widest text-black/40">
              {brandName}
            </span>
          </header>

          <div
            role="tablist"
            aria-label="Print-Farbsystem"
            className="flex flex-wrap gap-2"
          >
            {PRINT_FILTERS.map((filter) => {
              const isActive = filter.key === printFilter;
              return (
                <button
                  key={filter.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setPrintFilter(filter.key)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-widest transition ${
                    isActive
                      ? "bg-black text-white"
                      : "bg-black/85 text-white/70 hover:bg-black hover:text-white"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {visiblePrintColors.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              {visiblePrintColors.map((color) => (
                <ColorSwatch
                  key={`print-${printFilter}-${color.hex}-${color.name}`}
                  {...color}
                  onHoverChange={setHoveredColor}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-black/50">
              Für diese Auswahl sind noch keine Werte hinterlegt.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-5">
          <header className="flex items-baseline justify-between gap-4">
            <h3 className="text-xl font-semibold tracking-tight text-black">
              Digital
            </h3>
            <span className="text-xs uppercase tracking-widest text-black/40">
              RGB / HEX · {brandName}
            </span>
          </header>
          <div className="flex flex-wrap gap-4">
            {DIGITAL_COLORS.map((color) => (
              <ColorSwatch
                key={`digital-${color.hex}-${color.name}`}
                {...color}
                onHoverChange={setHoveredColor}
              />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
