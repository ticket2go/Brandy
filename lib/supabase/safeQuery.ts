import { supabase } from "./client";

type QueryLike<T> = PromiseLike<T> & {
  abortSignal?: (signal: AbortSignal) => unknown;
};

/**
 * Führt eine Supabase-Query mit hartem Timeout aus. Wenn die Query nicht
 * innerhalb von `timeoutMs` antwortet, versuchen wir genau einmal einen
 * Auth-Refresh und führen die Query danach erneut aus.
 *
 * Hintergrund: nach längerer Tab-Idle kommt es vor, dass `supabase-js`
 * intern in einem Recover-Pfad blockiert (Auth-Lock + abgelaufener
 * Refresh-Token), wodurch die nächste Query stumm hängt. Mit einem
 * expliziten Timeout + Refresh-Retry kommt der Aufruf sicher durch oder
 * scheitert mit einem aussagekräftigen Fehler, statt die UI in
 * "Lade …" hängen zu lassen.
 */
export async function safeQuery<T>(
  build: () => QueryLike<T>,
  options: { timeoutMs?: number; label?: string } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const label = options.label ?? "supabase";

  const runOnce = (): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new TimeoutError(`[safeQuery:${label}] timeout`));
      }, timeoutMs);
      Promise.resolve(build()).then(
        (value) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          reject(err);
        }
      );
    });

  try {
    return await runOnce();
  } catch (err) {
    if (!(err instanceof TimeoutError)) throw err;
    // Auth-Refresh forcieren und EIN Mal retryen.
    try {
      await Promise.race([
        supabase.auth.refreshSession(),
        new Promise((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    } catch {
      // ignore – ein hängender Refresh darf den Retry nicht blockieren
    }
    return runOnce();
  }
}

class TimeoutError extends Error {}
