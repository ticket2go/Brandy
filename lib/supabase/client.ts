import {
  createClient,
  processLock,
  type SupabaseClient,
} from "@supabase/supabase-js";

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

function buildClient(): SupabaseClient<Database> {
  // Bekanntes Verhalten in `@supabase/auth-js`:
  //
  // 1. Der Default-Lock (`navigator.locks`) kann nach Tab-Idle in einen
  //    "Lock was stolen"-Stall laufen. Wir benutzen daher den
  //    offiziellen `processLock` (reiner In-Memory-Mutex).
  //
  // 2. Wenn ein interner `_callRefreshToken` einen Fetch absetzt und
  //    keine Antwort mehr erhält (Browser hat den Hintergrund-Tab
  //    eingefroren, Server-Reset, …), bleibt das Promise in
  //    `refreshingDeferred` für immer pending. Jeder weitere
  //    Refresh-Aufruf wartet sich darauf tot. Genau deswegen sieht der
  //    User auf neu gemounteten Tabs (Farben/Schriften/Lokal) ein
  //    dauerhaftes "Lade …" – nur ein Page-Reload heilt den Zustand.
  //
  //    Wir setzen daher `lockAcquireTimeout` kurz und stellen über
  //    `recreateSupabaseClient()` (siehe unten) zusätzlich eine harte
  //    Recovery zur Verfügung: bei wiederholtem Timeout einer Daten-
  //    query wird der gesamte Client weggeworfen und neu aufgebaut –
  //    das ist äquivalent zum Reload, ohne den User zu stören.
  return createClient<Database>(supabaseUrl as string, supabaseAnonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: processLock,
      ...({ lockAcquireTimeout: 1500 } as Record<string, unknown>),
    },
  });
}

let _inner: SupabaseClient<Database> = buildClient();
let _version = 0;
const _listeners = new Set<(version: number) => void>();

export function recreateSupabaseClient(): number {
  _version += 1;
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

// Proxy-basierter Zugriff: alle existierenden Imports (`supabase`)
// bekommen automatisch den jeweils aktuellen Client geliefert. Methoden
// werden an den inneren Client gebunden, damit `this` stimmt.
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
