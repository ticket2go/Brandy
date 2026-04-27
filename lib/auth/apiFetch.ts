import { supabase } from "@/lib/supabase/client";

// Wraps fetch and attaches the current Supabase access-token as a Bearer
// header so server-side API-Routen den eingeloggten User identifizieren
// können (siehe lib/auth/getRequestUser.ts).
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
