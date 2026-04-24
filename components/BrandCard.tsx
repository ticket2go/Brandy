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
  const previewColors = (colors ?? []).slice(0, 3);

  return (
    <article className="group relative flex h-40 w-64 shrink-0 flex-col justify-between rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link
        href={`/brands/${slug}`}
        aria-label={`Brand "${name}" öffnen`}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
      />

      {logoSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt={`${name} Logo`}
          className="pointer-events-none absolute left-3 top-3 z-[1] h-9 w-9 rounded-lg border border-black/10 bg-white object-contain p-1"
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
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white text-black/40 opacity-0 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-black/10 group-hover:opacity-100"
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

      <footer className="pointer-events-none relative z-[1] flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="line-clamp-2 text-xl font-semibold tracking-tight text-black">
            {name}
          </h2>
          <span className="text-xs uppercase tracking-widest text-black/40">
            Brand
          </span>
        </div>
        {previewColors.length > 0 && (
          <div
            aria-label="Brand-Farben"
            className="flex shrink-0 items-center -space-x-1"
          >
            {previewColors.map((hex, idx) => (
              <span
                key={`${hex}-${idx}`}
                aria-hidden
                className="h-3.5 w-3.5 rounded-full border border-black/10 shadow-[0_0_0_1.5px_rgba(255,255,255,0.9)]"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}
