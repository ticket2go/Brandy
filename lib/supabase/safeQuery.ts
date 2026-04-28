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
 * Führt eine Supabase-Query mit kurzem Hard-Timeout aus.
 *
 * Recovery-Strategie ist auf schnelle Reaktion getrimmt – wenn der
 * Auth-Stack nach Tab-Idle stallt, soll der User höchstens ~2.5s
 * spüren:
 *
 *  1. 2.5s erster Versuch.
 *  2. Bei Timeout sofort den Supabase-Client neu erzeugen
 *     (heilt jeden hängenden internen Refresh-Promise) und mit
 *     1s warten auf Auth-Init nochmals probieren – 4s Hard-Limit.
 *
 * Der `SessionProvider` baut den Client zusätzlich proaktiv neu, wenn
 * der Tab > 30s im Hintergrund war; in dem typischen Fall fällt
 * Stufe 1 also gar nicht mehr in den Stall.
 */
export async function safeQuery<T>(
  build: () => QueryLike<T>,
  options: { timeoutMs?: number; label?: string } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 2500;
  const label = options.label ?? "supabase";

  try {
    return await runWithTimeout(build, timeoutMs, label);
  } catch (err) {
    if (!(err instanceof TimeoutError)) throw err;
  }

  // Direkt zum harten Recovery-Pfad: kompletten Client neu aufbauen.
  // Das ist das einzig zuverlässige Mittel gegen einen toten
  // refreshingDeferred-Promise im supabase-auth-Client.
  recreateSupabaseClient();
  try {
    await Promise.race([
      supabase.auth.getSession(),
      new Promise((resolve) => window.setTimeout(resolve, 1000)),
    ]);
  } catch {
    // ignore
  }
  return runWithTimeout(build, 4000, label);
}
