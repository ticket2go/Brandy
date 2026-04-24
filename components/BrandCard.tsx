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

export default function BrandCard({
  name,
  slug,
  logoUrl,
  colors,
  onDelete,
}: BrandCardProps) {
  const logoSrc = resolveLogoSrc(logoUrl);
  const swatches = (colors ?? []).slice(0, 3);

  const textMain = "text-white";
  const textMuted = "text-white/50";
  const deleteBtnClass =
    "bg-white/10 text-white/60 hover:bg-red-500/20 hover:text-red-300 focus:ring-white/20";
  const focusRingClass = "focus-visible:ring-white/40";

  return (
    <article className="group relative flex h-40 w-64 shrink-0 flex-col justify-between overflow-hidden rounded-2xl bg-black p-5 transition-transform hover:-translate-y-0.5">
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
            className="flex shrink-0 items-center gap-1.5"
          >
            {swatches.map((hex, idx) => (
              <span
                key={`${hex}-${idx}`}
                className="h-3 w-3 rounded-full"
                style={{
                  backgroundColor: hex,
                  boxShadow: `0 0 8px ${hex}66`,
                }}
                title={hex}
              />
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}
