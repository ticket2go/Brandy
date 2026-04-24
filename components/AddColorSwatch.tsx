"use client";

type AddColorSwatchProps = {
  onAdd?: () => void;
  label?: string;
};

export default function AddColorSwatch({
  onAdd,
  label = "Farbe hinzufügen",
}: AddColorSwatchProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={label}
      title={label}
      className="group relative flex w-44 shrink-0 flex-col overflow-hidden rounded-2xl border border-dashed border-black/15 bg-black/[0.02] text-black/40 shadow-none ring-0 transition-all duration-300 hover:-translate-y-1 hover:border-black/30 hover:bg-black/[0.04] hover:text-black/70 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
    >
      <div className="flex h-36 w-full items-center justify-center bg-black/[0.04]">
        <span
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full border border-current text-current transition-transform duration-300 group-hover:scale-105"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 4v12M4 10h12"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
      <div className="flex flex-col gap-1 px-3 py-3 text-left">
        <h4 className="text-sm font-bold uppercase tracking-tight text-black/40 group-hover:text-black/70">
          Neu
        </h4>
        <p className="text-[10px] font-medium uppercase tracking-widest text-black/30">
          Farbe hinzufügen
        </p>
      </div>
    </button>
  );
}
