import { createClient } from "@supabase/supabase-js";

import { GETHYPED_TOKEN_KEY } from "@/lib/gethyped-token";
import type { Database } from "@/lib/supabase/types";

export function envIngestToken(): string {
  return (
    process.env.GETHYPED_INGEST_TOKEN?.trim() ||
    process.env.GETHYPED_TOKEN?.trim() ||
    ""
  );
}

export async function storedIngestToken(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return "";
  try {
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client
      .from("app_settings")
      .select("value")
      .eq("key", GETHYPED_TOKEN_KEY)
      .maybeSingle();
    if (error) return "";
    return data?.value?.trim() ?? "";
  } catch {
    return "";
  }
}
