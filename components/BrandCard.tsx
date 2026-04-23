type BrandCardProps = {
  name: string;
};

export default function BrandCard({ name }: BrandCardProps) {
  return (
    <article className="group flex h-40 w-64 shrink-0 flex-col justify-between rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <header>
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
