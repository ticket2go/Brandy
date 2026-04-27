"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { useSession } from "./SessionProvider";

const STORAGE_KEY = "bs.user.name";
const DEFAULT_NAME = "Marcel";

function capitalize(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export default function Greeting() {
  const { user, profile, loading } = useSession();
  const [localName, setLocalName] = useState<string>(DEFAULT_NAME);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim().length > 0) {
        setLocalName(stored);
      }
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  // Wenn ein User eingeloggt ist, kommt der Name aus dem Profil und ist
  // nicht client-seitig editierbar – sonst (anonymer Besuch) bleibt das
  // alte Verhalten mit localStorage erhalten.
  const profileName = useMemo(() => {
    if (!user) return null;
    const candidate = profile?.full_name?.trim() || profile?.username?.trim();
    if (!candidate) return null;
    // Wenn nur ein Username vorhanden ist (kleingeschrieben), dann kapitalisieren.
    if (
      profile?.username &&
      candidate.toLowerCase() === profile.username.toLowerCase() &&
      candidate === candidate.toLowerCase()
    ) {
      return capitalize(candidate);
    }
    return candidate;
  }, [user, profile]);

  const displayName = profileName ?? localName;
  const editable = !user;

  useEffect(() => {
    if (!ready || !wrapperRef.current) return;
    if (loading) return;
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
  }, [ready, loading, displayName]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    if (!editable) return;
    setDraft(localName);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : DEFAULT_NAME;
    setLocalName(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(localName);
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
      {editable && editing ? (
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
      ) : editable ? (
        <button
          type="button"
          onClick={startEdit}
          aria-label="Namen bearbeiten"
          title="Namen bearbeiten"
          className="font-semibold text-black underline decoration-dotted decoration-black/30 underline-offset-4 transition hover:decoration-black"
        >
          {displayName}
        </button>
      ) : (
        <span className="font-semibold text-black">{displayName}</span>
      )}
      , schön dass du da bist!
    </p>
  );
}
