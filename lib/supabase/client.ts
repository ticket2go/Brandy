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

// Bekannter Bug in @supabase/supabase-js: der eingebaute
// `navigatorLock` (Web Locks API) gerät nach längerer Tab-Idle in einen
// Zustand, in dem jeder Lock-Acquire sofort mit
//   "Lock was stolen by another request"
// abgebrochen wird. Folgen:
//   * supabase.auth.getSession() / refreshSession() hängen oder
//     scheitern,
//   * supabase-js wirft den User intern aus (_removeSession + emit
//     SIGNED_OUT), obwohl die Session lokal noch gültig wäre,
//   * jede nachfolgende RLS-pflichtige Query bleibt im
//     "Lade …"-Zustand hängen.
//
// Lösung laut supabase/auth-js#768: in browserseitig genutzten Single-
// Tab-Apps den offiziellen `processLock` verwenden – ein reiner
// In-Memory-Mutex, der die Auth-Operationen weiterhin korrekt
// serialisiert, aber die kaputte `navigator.locks`-Pfadrichtung
// vermeidet.
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: processLock,
    },
  }
);
