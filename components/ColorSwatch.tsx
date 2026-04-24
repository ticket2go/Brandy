"use client";

import { useState } from "react";

export type ColorSwatchData = {
  name: string;
  hex: string;
  code: string;
  codeLabel?: string;
};

function renderCmyk(code: string) {
  const parts = code.split(/\s+/).filter(Boolean);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1 gap-y-0">
      {parts.map((part, index) => {
        const match = part.match(/^([CMYK])(\d+)$/);
        if (match) {
          return (
            <span key={`${part}-${index}`} className="inline-flex items-baseline">
              <span className="font-bold text-black">{match[1]}</span>
              <span>{match[2]}</span>
            </span>
          );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
  );
}

type ColorSwatchProps = ColorSwatchData & {
  onHoverChange?: (hex: string | null) => void;
};

export default function ColorSwatch({
  name,
  hex,
  code,
  codeLabel,
  onHoverChange,
}: ColorSwatchProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
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
          aria-label={`Farbwert ${code} kopieren`}
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
        {codeLabel && (
          <p className="text-[10px] font-medium uppercase tracking-widest text-black/40">
            {codeLabel}
          </p>
        )}
        <p className="font-mono text-[11px] leading-tight text-black/70">
          {codeLabel === "CMYK" ? renderCmyk(code) : code}
        </p>
      </div>
    </article>
  );
}
