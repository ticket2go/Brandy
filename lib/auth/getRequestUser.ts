import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

// Liest den aktuell eingeloggten User aus dem Authorization-Header (Bearer JWT).
// Der Browser-Client schickt das Access-Token mit, der Server prüft es per
// Service-Role-Client gegen Supabase Auth. So können wir in API-Routen
// vertrauenswürdig nach dem User fragen, ohne auf @supabase/ssr-Cookies
// angewiesen zu sein.
export async function getRequestUser(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  if (!token) return null;

  const client = createClient<Database>(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
