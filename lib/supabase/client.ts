/**
 * Supabase client for client components. Owner: Yeriel.
 *
 * Uses the anon key, which is public by design — it is useless without RLS
 * policies granting it something. RLS is what protects the data, not secrecy.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
