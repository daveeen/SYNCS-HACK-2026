/**
 * Service-role client. Owner: Yeriel.
 *
 * BYPASSES ROW LEVEL SECURITY COMPLETELY. Every guarantee the policies give you
 * is off for anything done through this client.
 *
 * Used for exactly one thing: inserting DERIVED rows the user never writes
 * directly — mentions and post_matches in plan 2. If you find yourself reaching
 * for it to insert a post or a comment, stop: that is the caller's token's job,
 * and using this instead silently disables ownership enforcement.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Copy .env.example to .env.local and add it.",
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
