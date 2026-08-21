import Link from "next/link";

type ScraperCardProps = {
  id: string;
  name: string;
  url: string;
  onDelete?: () => void;
};

export default function ScraperCard({
  id,
  name,
  url,
  onDelete,
}: ScraperCardProps) {
  return (
    <article className="group relative flex h-40 w-64 shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-black p-5 transition-transform hover:-translate-y-0.5">
      <Link
        href={`/eventscraper/${id}`}
        aria-label={`Scraper „${name}“ öffnen`}
        className="absolute inset-0 z-[1] rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      />

      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }}
          aria-label={`Scraper „${name}“ löschen`}
          title="Löschen"
          className="absolute right-3 top-3 z-[3] flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 opacity-0 transition hover:bg-red-500/20 hover:text-red-300 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/20 group-hover:opacity-100"
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

      <div className="pointer-events-none relative z-[2] flex min-w-0 flex-col gap-0.5">
        <h2 className="line-clamp-2 text-xl font-semibold tracking-tight text-white">
          {name}
        </h2>
        <span
          className="truncate text-[11px] font-normal text-white/50"
          title={url}
        >
          {url}
        </span>
      </div>
    </article>
  );
}
