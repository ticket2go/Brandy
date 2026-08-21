import Link from "next/link";

import EventscraperManager from "@/components/EventscraperManager";
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
      </header>
      <EventscraperManager />
    </main>
  );
}
