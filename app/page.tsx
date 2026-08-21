import Link from "next/link";

import Title from "@/components/Title";

export default function Home() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center gap-12 py-16">
      <header className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-6">
        <Title text="Projekte" />
        <div className="flex w-full max-w-md flex-col gap-4 sm:max-w-lg sm:flex-row">
          <Link
            href="/brandy"
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-black px-8 py-4 text-lg font-semibold text-white transition hover:bg-black/85"
          >
            Brandy
          </Link>
          <Link
            href="/eventscraper"
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-black px-8 py-4 text-lg font-semibold text-white transition hover:bg-black/85"
          >
            Eventscraper
          </Link>
        </div>
      </header>
    </main>
  );
}
