"use client";

import { useEffect } from "react";

/**
 * Ruft `reload()` auf, sobald der Tab wieder sichtbar wird oder das
 * Fenster den Fokus zurückbekommt.
 *
 * Hintergrund: Supabase-Queries können nach längerer Tab-Idle in einen
 * Stall-Zustand laufen (Auth-Token gerade abgelaufen, Auto-Refresh noch
 * nicht durchgelaufen). Klickt der User dann z.B. einen Tab in der
 * Brand-Detail-Seite an, der seine Daten erst lazy lädt, hängt die
 * Query stumm. Wir triggern in dem Fall ein zusätzliches `reload()`,
 * das nach dem Auth-Refresh sicher durchkommt.
 */
export function useVisibilityReload(reload: () => void): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);
}

/**
 * Wickelt eine Promise mit einem Hard-Timeout ein.
 *
 * Liefert das Promise-Ergebnis – oder das `timeoutValue`, wenn das
 * Timeout zuerst feuert. Praktisch, um Supabase-Calls nicht ewig
 * "Lade …" anzeigen zu lassen, falls der Auth-Stack im Stall steckt.
 */
export function withTimeout<T, F>(
  promise: Promise<T>,
  ms: number,
  timeoutValue: F
): Promise<T | F> {
  return new Promise<T | F>((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(timeoutValue);
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(timeoutValue);
      }
    );
  });
}
