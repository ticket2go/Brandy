import Link from "next/link";

import { supabase } from "@/lib/supabase/client";

const STORAGE_BUCKET = "brand-assets";

type BrandCardProps = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  colors?: string[];
  onDelete?: () => void;
};

function resolveLogoSrc(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("http")) return logoUrl;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(logoUrl);
  return data.publicUrl;
}

function hexLuminance(hex: string): number {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return 0;
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const toLin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export default function BrandCard({
  name,
  slug,
  logoUrl,
  colors,
  onDelete,
}: BrandCardProps) {
  const logoSrc = resolveLogoSrc(logoUrl);
  const swatches = (colors ?? []).slice(0, 3);

  // Verlauf aus den ersten zwei Farben der Brand; wenn nur eine existiert,
  // erzeugen wir einen weichen Verlauf auf dunkles Ende, sonst Schwarz.
  const gradientStart = colors?.[0] ?? "#000000";
  const gradientEnd =
    colors?.[1] ?? (colors?.[0] ? "#111111" : "#000000");
  const hasBrandGradient = (colors?.length ?? 0) > 0;

  // Durchschnitts-Luminanz bestimmt, ob Text hell oder dunkel ist.
  const avgLum = hasBrandGradient
    ? (hexLuminance(gradientStart) + hexLuminance(gradientEnd)) / 2
    : 0;
  const light = avgLum > 0.55;
  const textMain = light ? "text-black" : "text-white";
  const textMuted = light ? "text-black/50" : "text-white/50";
  const ringClass = light ? "ring-black/15" : "ring-white/20";
  const deleteBtnClass = light
    ? "bg-black/5 text-black/50 hover:bg-red-500/20 hover:text-red-600 focus:ring-black/20"
    : "bg-white/10 text-white/60 hover:bg-red-500/20 hover:text-red-300 focus:ring-white/20";
  const focusRingClass = light
    ? "focus-visible:ring-black/40"
    : "focus-visible:ring-white/40";

  return (
    <article
      className="group relative flex h-40 w-64 shrink-0 flex-col justify-between overflow-hidden rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
      style={{
        backgroundImage: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
        backgroundColor: gradientStart,
      }}
    >
      <Link
        href={`/brands/${slug}`}
        aria-label={`Brand "${name}" öffnen`}
        className={`absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 ${focusRingClass}`}
      />

      {logoSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt={`${name} Logo`}
          className="pointer-events-none absolute left-3 top-3 z-[1] h-9 w-9 rounded-full bg-white object-cover"
        />
      )}

      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }}
          aria-label={`Brand "${name}" löschen`}
          title="Löschen"
          className={`absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full opacity-0 transition focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 ${deleteBtnClass}`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 2L10 10M10 2L2 10"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      <div aria-hidden className="h-9" />

      <footer className="pointer-events-none relative z-[1] flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            className={`line-clamp-2 text-xl font-semibold tracking-tight ${textMain}`}
          >
            {name}
          </h2>
          <span
            className={`text-xs uppercase tracking-widest ${textMuted}`}
          >
            Brand
          </span>
        </div>

        {swatches.length > 0 && (
          <div
            aria-label="Brand-Farben"
            className="flex shrink-0 items-center gap-1"
          >
            {swatches.map((hex, idx) => (
              <span
                key={`${hex}-${idx}`}
                className={`h-3 w-3 rounded-full ring-1 ${ringClass}`}
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}
