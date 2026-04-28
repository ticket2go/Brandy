import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL fehlt. Lege die Variable in .env.local an."
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt. Lege die Variable in .env.local an."
  );
}

class LockAcquireTimeoutError extends Error {
  isAcquireTimeout = true;
  constructor(name: string) {
    super(`Acquiring local lock "${name}" timed out`);
  }
}

/**
 * Erzeugt einen In-Memory-Lock, der seinen kompletten State *pro
 * Client-Instanz* hält. Damit kann ein hängender Refresh den nächsten
 * frisch gebauten Client nicht mehr blockieren – im Gegensatz zu dem
 * von supabase-js mitgelieferten `processLock`, dessen Map modulweit
 * geteilt wird.
 *
 * Verhalten orientiert sich am offiziellen processLock:
 *  - acquireTimeout < 0  → kein Timeout
 *  - acquireTimeout = 0  → nur ausführen, wenn frei; sonst Fehler
 *  - acquireTimeout > 0  → max. so lange auf den vorherigen Lauf warten,
 *                          dann Fehler mit `isAcquireTimeout = true`.
 */
function createInstanceLock() {
  const pending = new Map<string, Promise<unknown>>();

  return async function instanceLock<R>(
    name: string,
    acquireTimeout: number,
    fn: () => Promise<R>
  ): Promise<R> {
    const previous = pending.get(name) ?? Promise.resolve();

    // Auf den Vorgänger warten, ohne dessen Fehler zu erben.
    const previousHandled = previous.then(
      () => undefined,
      () => undefined
    );

    let waitForPrevious: Promise<void>;
    if (acquireTimeout < 0) {
      waitForPrevious = previousHandled;
    } else if (acquireTimeout === 0) {
      // Sofort prüfen.
      waitForPrevious = (async () => {
        const settled = await Promise.race([
          previousHandled.then(() => "settled" as const),
          Promise.resolve("pending" as const),
        ]);
        if (settled !== "settled") {
          throw new LockAcquireTimeoutError(name);
        }
      })();
    } else {
      waitForPrevious = (async () => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), acquireTimeout);
        });
        try {
          const winner = await Promise.race([
            previousHandled.then(() => "settled" as const),
            timeout,
          ]);
          if (winner === "timeout") {
            throw new LockAcquireTimeoutError(name);
          }
        } finally {
          if (timer) clearTimeout(timer);
        }
      })();
    }

    const current = (async () => {
      await waitForPrevious;
      return fn();
    })();

    // Nachfolger sollen erst auf das aktuelle Run warten, nicht auf den
    // schon-fertigen Vorgänger.
    pending.set(
      name,
      current.then(
        () => undefined,
        () => undefined
      )
    );

    try {
      return await current;
    } finally {
      // Wenn niemand mehr wartet (kein neuer Eintrag), Map säubern.
      // Falls der Lock durch eine spätere Operation überschrieben
      // wurde, lassen wir den neuen Eintrag stehen.
      if (pending.get(name) && (await isSettled(pending.get(name)!))) {
        pending.delete(name);
      }
    }
  };
}

async function isSettled(p: Promise<unknown>): Promise<boolean> {
  const sentinel = Symbol("pending");
  const result = await Promise.race([
    p.then(
      () => "settled",
      () => "settled"
    ),
    Promise.resolve(sentinel),
  ]);
  return result === "settled";
}

function buildClient(): SupabaseClient<Database> {
  // Kein navigator.locks (kann nach Tab-Idle in "Lock was stolen"-Stalls
  // laufen) und kein modulweiter processLock (würde den Stall auf
  // Folge-Clients vererben). Stattdessen ein per-Client Lock, der nach
  // einem Recreate frisch leer startet.
  return createClient<Database>(
    supabaseUrl as string,
    supabaseAnonKey as string,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: createInstanceLock(),
        ...({ lockAcquireTimeout: 1500 } as Record<string, unknown>),
      },
    }
  );
}

let _inner: SupabaseClient<Database> = buildClient();
let _version = 0;
const _listeners = new Set<(version: number) => void>();

export function recreateSupabaseClient(): number {
  _version += 1;
  // Vorher abmelden, damit der alte Client keine Auto-Refresh-Ticker
  // mehr feuert und keine onAuthStateChange-Events mehr produziert.
  try {
    _inner.auth.stopAutoRefresh().catch(() => undefined);
  } catch {
    // ignore
  }
  _inner = buildClient();
  for (const listener of _listeners) {
    try {
      listener(_version);
    } catch {
      // ignore
    }
  }
  return _version;
}

export function onSupabaseRecreated(
  listener: (version: number) => void
): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function getSupabaseClientVersion(): number {
  return _version;
}

export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop) {
      const value = (_inner as unknown as Record<string | symbol, unknown>)[
        prop as string
      ];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(_inner);
      }
      return value;
    },
    has(_target, prop) {
      return prop in (_inner as unknown as object);
    },
  }
);
