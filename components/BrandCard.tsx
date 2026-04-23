type BrandCardProps = {
  name: string;
  onDelete?: () => void;
};

export default function BrandCard({ name, onDelete }: BrandCardProps) {
  return (
    <article className="group relative flex h-40 w-64 shrink-0 flex-col justify-between rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Brand "${name}" löschen`}
          title="Löschen"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white text-black/40 opacity-0 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-black/10 group-hover:opacity-100"
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

      <header className="pr-8">
        <h2 className="line-clamp-2 text-xl font-semibold tracking-tight text-black">
          {name}
        </h2>
      </header>
      <footer className="text-xs uppercase tracking-widest text-black/40">
        Brand
      </footer>
    </article>
  );
}
