"use client";

import { useEffect, useRef, useState } from "react";

import ColorSwatch, { type ColorSwatchData } from "./ColorSwatch";

type ColorsPanelProps = {
  brandName: string;
};

const PRINT_COLORS: ColorSwatchData[] = [
  { name: "Swoosh Black", code: "Pantone Black 6 C", hex: "#111111" },
  { name: "Off-White", code: "Pantone 11-0601 TCX", hex: "#F5F2EA" },
  { name: "Volt", code: "Pantone 388 C", hex: "#E4FF1A" },
  { name: "University Red", code: "Pantone 186 C", hex: "#C8102E" },
  { name: "Royal Blue", code: "Pantone 286 C", hex: "#1D3FA5" },
];

const DIGITAL_COLORS: ColorSwatchData[] = [
  { name: "Ink", code: "RGB 17 · 17 · 17", hex: "#111111" },
  { name: "Paper", code: "RGB 250 · 250 · 250", hex: "#FAFAFA" },
  { name: "Signal", code: "RGB 228 · 255 · 26", hex: "#E4FF1A" },
  { name: "Accent Red", code: "RGB 239 · 68 · 68", hex: "#EF4444" },
  { name: "Accent Blue", code: "RGB 37 · 99 · 235", hex: "#2563EB" },
  { name: "Accent Mint", code: "RGB 16 · 185 · 129", hex: "#10B981" },
];

export default function ColorsPanel({ brandName }: ColorsPanelProps) {
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

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
              Pantone / CMYK · {brandName}
            </span>
          </header>
          <div className="flex flex-wrap gap-4">
            {PRINT_COLORS.map((color) => (
              <ColorSwatch
                key={`print-${color.hex}-${color.name}`}
                {...color}
                onHoverChange={setHoveredColor}
              />
            ))}
          </div>
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
