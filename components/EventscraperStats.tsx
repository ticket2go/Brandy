"use client";

import { useEffect, useState } from "react";

import { loadScrapers, scraperEntryCount } from "@/lib/event-scrapers";

export default function EventscraperStats() {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const sync = () => {
      const scrapers = loadScrapers();
      setTotal(
        scrapers.reduce((sum, scraper) => sum + scraperEntryCount(scraper), 0)
      );
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("eventscraper-updated", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("eventscraper-updated", sync);
    };
  }, []);

  return (
    <p className="text-sm font-medium text-black/70">
      {total === 1 ? "1 Eintrag gescraped" : `${total} Einträge gescraped`}
    </p>
  );
}
