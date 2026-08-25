import { supabase } from "@/lib/supabase/client";
import { safeQuery } from "@/lib/supabase/safeQuery";

export const FIGMA_TOKEN_KEY = "figma.token";

const LOCAL_KEY = "brandy.figma.token";

/** Fällt auf localStorage zurück, falls app_settings nicht erreichbar ist. */
export function loadLocalFigmaToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LOCAL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveLocalFigmaToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (token.trim()) window.localStorage.setItem(LOCAL_KEY, token.trim());
    else window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Ohne lokalen Speicher bleibt der DB-Wert maßgeblich.
  }
}

export async function storeFigmaToken(token: string): Promise<boolean> {
  const value = token.trim();
  saveLocalFigmaToken(value);
  try {
    const result = await safeQuery(
      () =>
        supabase
          .from("app_settings")
          .upsert({ key: FIGMA_TOKEN_KEY, value }, { onConflict: "key" }),
      { timeoutMs: 8000, label: "figma-token-save" }
    );
    return !result.error;
  } catch {
    return false;
  }
}
