"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import ConfirmDialog from "./ConfirmDialog";
import ScraperCard from "./ScraperCard";
import { runScraper, scrapeScraperFollowUps } from "@/lib/run-scraper";
import {
  loadScrapers,
  newScraper,
  normalizeUrl,
  saveScrapers,
  updateScraper,
  type Scraper,
} from "@/lib/scrapers";

export default function ScraperManager() {
  const [scrapers, setScrapers] = useState<Scraper[]>([]);
  const [ready, setReady] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const followUpAbort = useRef<AbortController | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Scraper | null>(null);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const loaded = loadScrapers().map((item) => {
        if (!item.followUp?.running) return item;
        return (
          updateScraper(item.id, {
            followUp: { ...item.followUp, running: false },
          }) ?? item
        );
      });
      setScrapers(loaded);
      setReady(true);
    };
    sync();
    const handleVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, []);

  useEffect(() => {
    if (!formOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let cancelled = false;
    (async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !overlayRef.current || !panelRef.current) return;
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0, backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)" },
        {
          opacity: 1,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          duration: 0.45,
          ease: "power3.out",
        }
      );
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 30, filter: "blur(16px)", scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          scale: 1,
          duration: 0.55,
          ease: "power3.out",
        }
      );
      inputRef.current?.focus();
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen]);

  const closeForm = async () => {
    const gsap = (await import("gsap")).default;
    if (!overlayRef.current || !panelRef.current) {
      setFormOpen(false);
      setName("");
      setUrl("");
      setError(null);
      return;
    }
    gsap.to(panelRef.current, {
      opacity: 0,
      y: 20,
      filter: "blur(12px)",
      scale: 0.98,
      duration: 0.3,
      ease: "power2.in",
    });
    gsap.to(overlayRef.current, {
      opacity: 0,
      backdropFilter: "blur(0px)",
      WebkitBackdropFilter: "blur(0px)",
      duration: 0.35,
      ease: "power2.in",
      onComplete: () => {
        setFormOpen(false);
        setName("");
        setUrl("");
        setError(null);
      },
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const normalizedUrl = normalizeUrl(url);
    if (!trimmedName) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    if (!normalizedUrl) {
      setError("Bitte eine gültige URL angeben.");
      return;
    }
    const nextList = [...scrapers, newScraper(trimmedName, normalizedUrl)];
    setScrapers(nextList);
    saveScrapers(nextList);
    closeForm();
  };

  const handleRun = async (scraper: Scraper) => {
    setRunningId(scraper.id);
    try {
      const next = await runScraper(scraper);
      if (next) {
        setScrapers((prev) =>
          prev.map((item) => (item.id === next.id ? next : item))
        );
      }
    } finally {
      setRunningId(null);
    }
  };

  const handleFollowUps = async (scraper: Scraper) => {
    const controller = new AbortController();
    followUpAbort.current = controller;
    setFollowUpId(scraper.id);
    try {
      const next = await scrapeScraperFollowUps(
        scraper,
        (_progress, updated) => {
          setScrapers((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        },
        controller.signal
      );
      if (next) {
        setScrapers((prev) =>
          prev.map((item) => (item.id === next.id ? next : item))
        );
      }
    } finally {
      if (followUpAbort.current === controller) followUpAbort.current = null;
      setFollowUpId(null);
    }
  };

  const handleStopFollowUps = () => {
    followUpAbort.current?.abort();
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const nextList = scrapers.filter((item) => item.id !== pendingDelete.id);
    setScrapers(nextList);
    saveScrapers(nextList);
    setPendingDelete(null);
  };

  const canSave = name.trim().length > 0 && url.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        aria-label="Neuen Scraper anlegen"
        title="Neuen Scraper anlegen"
        className="fixed left-6 top-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-sm transition hover:scale-105 hover:bg-black/85"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6">
        {!ready ? (
          <p className="text-sm text-black/50">Lade …</p>
        ) : scrapers.length > 0 ? (
          <div className="flex flex-col gap-4">
            {scrapers.map((scraper) => (
              <ScraperCard
                key={scraper.id}
                scraper={scraper}
                running={runningId === scraper.id}
                following={followUpId === scraper.id}
                onRun={() => handleRun(scraper)}
                onFollowUps={() => handleFollowUps(scraper)}
                onStopFollowUps={handleStopFollowUps}
                onDelete={() => setPendingDelete(scraper)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-black/50">
            Noch keine Scraper. Lege den ersten mit dem{" "}
            <kbd className="rounded bg-black/5 px-1 py-0.5 text-[11px]">+</kbd> oben
            links an.
          </p>
        )}
      </section>

      {formOpen && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label="Neuen Scraper anlegen"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
          style={{
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
          onClick={() => closeForm()}
        >
          <div
            ref={panelRef}
            className="w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex items-end gap-6 border-b-2 border-white/70 px-2 pb-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor="scraper-name" className="sr-only">
                    Name
                  </label>
                  <input
                    ref={inputRef}
                    id="scraper-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Name …"
                    autoComplete="off"
                    className="min-w-0 flex-1 border-0 bg-transparent font-semibold tracking-tight text-white placeholder:text-white/40 outline-none focus:outline-none focus:ring-0"
                    style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)" }}
                  />
                  <label htmlFor="scraper-url" className="sr-only">
                    URL
                  </label>
                  <input
                    id="scraper-url"
                    type="text"
                    inputMode="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="URL die zu scrapen ist …"
                    autoComplete="off"
                    className="min-w-0 border-0 bg-transparent text-base text-white/70 placeholder:text-white/30 outline-none focus:outline-none focus:ring-0"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSave}
                  className="mb-2 shrink-0 rounded-full bg-white px-8 py-4 text-lg font-semibold text-black transition enabled:hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anlegen
                </button>
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-100"
                >
                  {error}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Scraper wirklich löschen?"
        description={
          pendingDelete
            ? `„${pendingDelete.name}“ wird entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`
            : undefined
        }
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
