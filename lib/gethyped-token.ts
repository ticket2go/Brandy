import { supabase } from "@/lib/supabase/client";
import { safeQuery } from "@/lib/supabase/safeQuery";

export const GETHYPED_TOKEN_KEY = "gethyped.ingest_token";

const LOCAL_KEY = "eventscraper.gethyped.token";

/** Fällt auf localStorage zurück, solange 0017_app_settings.sql fehlt. */
export function loadLocalToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LOCAL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveLocalToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (token.trim()) window.localStorage.setItem(LOCAL_KEY, token.trim());
    else window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Ohne lokalen Speicher bleibt der DB-Wert maßgeblich.
  }
}

export async function fetchStoredToken(): Promise<string> {
  try {
    const result = await safeQuery(
      () =>
        supabase
          .from("app_settings")
          .select("value")
          .eq("key", GETHYPED_TOKEN_KEY)
          .maybeSingle(),
      { timeoutMs: 8000, label: "gethyped-token" }
    );
    if (result.error) return loadLocalToken();
    const value = result.data?.value ?? "";
    return value.trim() || loadLocalToken();
  } catch {
    return loadLocalToken();
  }
}

export async function storeToken(token: string): Promise<boolean> {
  const value = token.trim();
  saveLocalToken(value);
  try {
    const result = await safeQuery(
      () =>
        supabase
          .from("app_settings")
          .upsert({ key: GETHYPED_TOKEN_KEY, value }, { onConflict: "key" }),
      { timeoutMs: 8000, label: "gethyped-token-save" }
    );
    return !result.error;
  } catch {
    return false;
  }
}
