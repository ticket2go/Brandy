import Link from "next/link";

import ScraperManager from "@/components/ScraperManager";
import Title from "@/components/Title";

export default function EventscraperPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-stretch justify-start gap-12 py-16">
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6">
        <Link
          href="/"
          className="w-fit text-sm text-black/50 transition hover:text-black"
        >
          Projekte
        </Link>
        <Title text="Eventscraper" />
        <p className="text-sm text-black/55">
          Jede Card ist ein eigener Scraper. Nach dem Öffnen siehst du die
          Seite und klickst die Elemente an, die übernommen werden sollen.
        </p>
      </header>
      <ScraperManager />
    </main>
  );
}
