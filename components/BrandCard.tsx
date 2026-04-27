import Link from "next/link";

import { supabase } from "@/lib/supabase/client";

const STORAGE_BUCKET = "brand-assets";

type BrandCardProps = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  colors?: string[];
  legalName?: string | null;
  onDelete?: () => void;
};

function resolveLogoSrc(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("http")) return logoUrl;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(logoUrl);
  return data.publicUrl;
}

export default function BrandCard({
  name,
  slug,
  logoUrl,
  colors,
  legalName,
  onDelete,
}: BrandCardProps) {
  const logoSrc = resolveLogoSrc(logoUrl);
  const swatches = (colors ?? []).slice(0, 3);

  // Verlauf aus den Brand-Farben, der aus der unteren rechten Ecke nach oben
  // links ausklingt. Drei radiale Layer leicht versetzt, damit die Farben
  // ineinander uebergehen. Der Verlauf ist standardmaessig unsichtbar und
  // wird erst beim Hover eingeblendet, damit die Karte ansonsten schwarz bleibt.
  const glowLayers: string[] = [];
  if (swatches.length > 0) {
    const offsets = [
      { x: "100%", y: "100%", alpha: "80", fade: "70%" }, // ~50 %
      { x: "85%", y: "115%", alpha: "66", fade: "65%" }, // ~40 %
      { x: "115%", y: "85%", alpha: "66", fade: "65%" }, // ~40 %
    ];
    for (let i = 0; i < swatches.length; i += 1) {
      const hex = swatches[i];
      const off = offsets[i] ?? offsets[0];
      glowLayers.push(
        `radial-gradient(circle at ${off.x} ${off.y}, ${hex}${off.alpha} 0%, ${hex}00 ${off.fade})`
      );
    }
  }
  const glowBackground = glowLayers.join(", ");

  const textMain = "text-white";
  const textMuted = "text-white/50";
  const deleteBtnClass =
    "bg-white/10 text-white/60 hover:bg-red-500/20 hover:text-red-300 focus:ring-white/20";
  const focusRingClass = "focus-visible:ring-white/40";

  return (
    <article className="group relative flex h-40 w-64 shrink-0 flex-col justify-between overflow-hidden rounded-2xl bg-black p-5 transition-transform hover:-translate-y-0.5">
      {glowBackground && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ backgroundImage: glowBackground }}
        />
      )}
      <Link
        href={`/brands/${slug}`}
        aria-label={`Brand "${name}" öffnen`}
        className={`absolute inset-0 z-[1] rounded-2xl focus:outline-none focus-visible:ring-2 ${focusRingClass}`}
      />

      {logoSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt={`${name} Logo`}
          className="pointer-events-none absolute left-3 top-3 z-[2] h-9 w-9 rounded-full bg-white object-cover"
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
          className={`absolute right-3 top-3 z-[3] flex h-7 w-7 items-center justify-center rounded-full opacity-0 transition focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 ${deleteBtnClass}`}
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

      <footer className="pointer-events-none relative z-[2] flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            className={`line-clamp-2 text-xl font-semibold tracking-tight ${textMain}`}
          >
            {name}
          </h2>
          {legalName && (
            <span
              className={`truncate text-[11px] font-normal normal-case tracking-normal ${textMuted}`}
              title={legalName}
            >
              {legalName}
            </span>
          )}
        </div>
      </footer>
    </article>
  );
}
