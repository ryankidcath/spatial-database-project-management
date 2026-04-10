import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client baca/tulis server-side dengan anon key.
 * RLS saat ini longgar (dev); nanti ganti ke @supabase/ssr + session user.
 */
export function createServerSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
