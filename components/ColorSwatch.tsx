"use client";

import { useState } from "react";

export type ColorSwatchData = {
  name: string;
  hex: string;
  code?: string;
};

type ColorSwatchProps = ColorSwatchData & {
  onHoverChange?: (hex: string | null) => void;
};

function getReadableTextColor(hex: string): "black" | "white" {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "black";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "black" : "white";
}

export default function ColorSwatch({
  name,
  hex,
  code,
  onHoverChange,
}: ColorSwatchProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <article
      onMouseEnter={() => onHoverChange?.(hex)}
      onMouseLeave={() => onHoverChange?.(null)}
      onFocus={() => onHoverChange?.(hex)}
      onBlur={() => onHoverChange?.(null)}
      className="group relative flex w-44 shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5 transition-transform duration-300 hover:z-40 hover:-translate-y-1 hover:shadow-xl"
    >
      <div
        className="relative h-36 w-full"
        style={{ backgroundColor: hex }}
        aria-hidden
      >
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Farbwert ${hex} kopieren`}
          title={copied ? "Kopiert" : "Kopieren"}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black text-white opacity-0 shadow-md transition-all duration-200 hover:scale-105 hover:bg-black/85 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/70 group-hover:opacity-100"
        >
          {copied ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 7.5L6 11L11.5 3.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="4"
                y="4"
                width="8"
                height="8"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M2 9.5V3a1 1 0 0 1 1-1h6.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>
      <div className="flex flex-col gap-1 px-3 py-3">
        <h4 className="text-sm font-bold uppercase tracking-tight text-black">
          {name}
        </h4>
        {code && (
          <p className="text-[11px] font-medium uppercase tracking-wider text-black/70">
            {code}
          </p>
        )}
        <p className="font-mono text-[11px] text-black/60">{hex.toUpperCase()}</p>
      </div>
      <span className="sr-only">
        Textkontrast: {getReadableTextColor(hex)}
      </span>
    </article>
  );
}
