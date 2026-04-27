"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { apiFetch } from "@/lib/auth/apiFetch";

export type ManagerSuggestion = {
  id: string;
  username: string | null;
  full_name: string | null;
};

type Props = {
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  helperText?: string;
  /**
   * Wenn true, kann der Eingebende auch Usernames hinzufügen, die nicht
   * von der Suche zurückkommen (z.B. exakter Treffer ohne Tipp). Default
   * true – bestätigt wird per Enter / Komma / Klick auf Vorschlag.
   */
  allowFreeText?: boolean;
};

// Tag-Input mit dynamischer Username-Suche.
//
// - Während des Tippens wird /api/users/search?q= mit kurzem Debounce
//   abgefragt.
// - Auswahl per Enter / Komma / Klick → Tag wird hinzugefügt.
// - Tags lassen sich per × oder Backspace entfernen.
export default function ManagerTagInput({
  values,
  onChange,
  disabled,
  placeholder = "Benutzername …",
  label,
  helperText,
  allowFreeText = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ManagerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const debounceRef = useRef<number | null>(null);
  const lastQueryRef = useRef<string>("");

  const fetchSuggestions = useCallback(
    async (q: string) => {
      lastQueryRef.current = q;
      setLoading(true);
      try {
        const res = await apiFetch(
          `/api/users/search?q=${encodeURIComponent(q)}&limit=8`
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const json = (await res.json()) as { users?: ManagerSuggestion[] };
        // Nur übernehmen, wenn die Antwort noch zur aktuellen Query passt.
        if (lastQueryRef.current !== q) return;
        const taken = new Set(values.map((v) => v.toLowerCase()));
        setSuggestions(
          (json.users ?? []).filter(
            (u) => u.username && !taken.has(u.username.toLowerCase())
          )
        );
        setHighlighted(0);
      } finally {
        if (lastQueryRef.current === q) setLoading(false);
      }
    },
    [values]
  );

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(q);
    }, 150);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, open, fetchSuggestions]);

  const addTag = useCallback(
    (raw: string) => {
      const v = raw.trim().toLowerCase();
      if (!v) return;
      if (values.some((x) => x.toLowerCase() === v)) {
        setQuery("");
        return;
      }
      onChange([...values, v]);
      setQuery("");
      setSuggestions([]);
      setOpen(true);
    },
    [onChange, values]
  );

  const removeTag = (idx: number) => {
    if (disabled) return;
    const next = values.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && suggestions.length > 0 && highlighted < suggestions.length) {
        const pick = suggestions[highlighted];
        if (pick.username) {
          addTag(pick.username);
          return;
        }
      }
      if (allowFreeText) addTag(query);
      return;
    }
    if (e.key === "Backspace" && !query && values.length > 0) {
      e.preventDefault();
      removeTag(values.length - 1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) =>
        suggestions.length === 0
          ? 0
          : Math.min(h + 1, suggestions.length - 1)
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-xs font-medium uppercase tracking-wider text-black/50">
          {label}
        </span>
      )}
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black focus-within:border-black focus-within:ring-2 focus-within:ring-black/10 ${
          disabled ? "opacity-60" : ""
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v, idx) => (
          <span
            key={`${v}-${idx}`}
            className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-black/80"
          >
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(idx);
              }}
              disabled={disabled}
              aria-label={`Verwalter „${v}" entfernen`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-black/50 transition hover:bg-black/10 hover:text-black"
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2 2l6 6M8 2l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        ))}
        <div className="relative flex min-w-[120px] flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={handleKey}
            placeholder={values.length === 0 ? placeholder : ""}
            disabled={disabled}
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls={listboxId}
            className="w-full min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm text-black placeholder:text-black/30 outline-none focus:outline-none focus:ring-0"
          />
          {open && (suggestions.length > 0 || loading) && (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border border-black/10 bg-white py-1 text-sm shadow-lg"
            >
              {loading && suggestions.length === 0 && (
                <li className="px-3 py-2 text-xs text-black/40">Suche …</li>
              )}
              {suggestions.map((s, idx) => {
                const isHi = idx === highlighted;
                return (
                  <li
                    key={s.id}
                    role="option"
                    aria-selected={isHi}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (s.username) addTag(s.username);
                    }}
                    onMouseEnter={() => setHighlighted(idx)}
                    className={`cursor-pointer px-3 py-1.5 ${
                      isHi ? "bg-black/5" : ""
                    }`}
                  >
                    <span className="font-medium text-black">
                      {s.username ?? "—"}
                    </span>
                    {s.full_name && (
                      <span className="ml-2 text-xs text-black/50">
                        {s.full_name}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {helperText && (
        <span className="text-[11px] text-black/40">{helperText}</span>
      )}
    </div>
  );
}
