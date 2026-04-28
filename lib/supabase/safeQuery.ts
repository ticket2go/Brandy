import { recreateSupabaseClient, supabase } from "./client";

type QueryLike<T> = PromiseLike<T>;

class TimeoutError extends Error {
  constructor(label: string) {
    super(`[safeQuery:${label}] timeout`);
    this.name = "SafeQueryTimeout";
  }
}

function runWithTimeout<T>(
  build: () => QueryLike<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TimeoutError(label));
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
}

/**
 * Führt eine Supabase-Query mit hartem Timeout aus.
 *
 * Recovery-Strategie:
 *  1. Erster Versuch (timeoutMs).
 *  2. Bei Timeout → `auth.refreshSession()` mit kurzem Limit, dann
 *     zweiter Versuch.
 *  3. Bei erneutem Timeout → kompletten Supabase-Client neu erzeugen
 *     (Auth-Stalls in `_callRefreshToken` heilt nur ein neuer Client),
 *     dann letzter Versuch.
 *
 * Hintergrund: Nach längerer Tab-Idle bleibt das interne
 * `refreshingDeferred`-Promise im supabase-auth-Client mitunter für
 * immer pending. Jeder neue `auth.*`-Call wartet sich darauf tot,
 * sodass selbst ein neuer `refreshSession()` nichts mehr bringt – nur
 * ein Page-Reload heilt den Zustand. Mit dem Client-Recreate-Schritt
 * machen wir genau das, ohne den User aus der App zu werfen.
 */
export async function safeQuery<T>(
  build: () => QueryLike<T>,
  options: { timeoutMs?: number; label?: string } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const label = options.label ?? "supabase";

  try {
    return await runWithTimeout(build, timeoutMs, label);
  } catch (err) {
    if (!(err instanceof TimeoutError)) throw err;
  }

  // 2. Versuch nach Auth-Refresh.
  try {
    await Promise.race([
      supabase.auth.refreshSession(),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  } catch {
    // ignore – ein hängender Refresh blockiert den Retry nicht
  }
  try {
    return await runWithTimeout(build, timeoutMs, label);
  } catch (err) {
    if (!(err instanceof TimeoutError)) throw err;
  }

  // 3. Letzter Versuch: kompletten Client neu aufbauen, der Build()-
  // Aufruf greift dabei automatisch auf den frisch erstellten Client zu
  // (siehe Proxy in lib/supabase/client.ts).
  recreateSupabaseClient();
  // Auf den initialize-Pfad des neuen Clients warten, damit die Query
  // mit gültiger Session fährt. getSession() implizit ruft die
  // initializePromise auf.
  try {
    await Promise.race([
      supabase.auth.getSession(),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  } catch {
    // ignore
  }
  return runWithTimeout(build, timeoutMs, label);
}
