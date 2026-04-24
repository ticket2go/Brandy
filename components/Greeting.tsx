"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

const STORAGE_KEY = "bs.user.name";
const DEFAULT_NAME = "Marcel";

export default function Greeting() {
  const [name, setName] = useState<string>(DEFAULT_NAME);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim().length > 0) {
        setName(stored);
      }
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !wrapperRef.current) return;
    let cancelled = false;

    (async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !wrapperRef.current) return;
      gsap.fromTo(
        wrapperRef.current,
        { opacity: 0, filter: "blur(10px)" },
        {
          opacity: 1,
          filter: "blur(0px)",
          duration: 0.8,
          ease: "power2.out",
          delay: 0.15,
        }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : DEFAULT_NAME;
    setName(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commit();
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <p
      ref={wrapperRef}
      className="m-0 text-lg text-black/70"
      style={{ opacity: 0 }}
    >
      Hallo{" "}
      {editing ? (
        <form onSubmit={handleSubmit} className="inline">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKey}
            aria-label="Dein Name"
            placeholder={DEFAULT_NAME}
            className="inline-block w-auto min-w-[4ch] max-w-[16ch] border-b border-black/30 bg-transparent px-0.5 font-semibold text-black outline-none focus:border-black"
            style={{ width: `${Math.max(draft.length, 1) + 1}ch` }}
            autoComplete="off"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          aria-label="Namen bearbeiten"
          title="Namen bearbeiten"
          className="font-semibold text-black underline decoration-dotted decoration-black/30 underline-offset-4 transition hover:decoration-black"
        >
          {name}
        </button>
      )}
      , schön dass du da bist!
    </p>
  );
}
