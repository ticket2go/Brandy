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

// Bekannter Bug in @supabase/supabase-js: der eingebaute
// navigator.locks-basierte Lock kann nach längerer Tab-Idle dauerhaft
// hängen. Folge: supabase.auth.getSession() und jede anschließende
// Query (Brands, Farben, ...) blockiert für immer, bis der User die
// Seite hart neu lädt – und dann passiert es sofort wieder.
//
// Wir benutzen die App de facto nur in einem Tab pro User, daher ist
// der Multi-Tab-Lock unnötig und wir ersetzen ihn durch eine No-Op.
// Damit kommen Queries sofort durch und der Auto-Refresh läuft wieder
// zuverlässig nach Tab-Wechsel.
//
// Siehe: https://github.com/supabase/auth-js/issues/768
const noopLock: <R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>
) => Promise<R> = (_name, _timeout, fn) => fn();

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: noopLock,
    },
  }
);
