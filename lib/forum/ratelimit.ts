/**
 * Write throttling. Owner: Yeriel.
 *
 * Counted in Postgres, not in memory. An in-process counter would be actively
 * wrong here: serverless instances share no memory, so it resets on every cold
 * start and is bypassed outright by concurrency. The database is the one thing
 * every lambda shares.
 *
 * No `server-only` guard: isOverLimit is pure and scripts/check.ts asserts it
 * under plain Node, where that package throws. There is nothing secret here —
 * countRecentWrites takes the client as an argument rather than building one.
 *
 * This is the ONLY abuse control. There is no content moderation — see
 * forum-spec.md §11. Rate limiting slows a script down; it does not stop one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const LIMITS = {
  post: { max: 5, windowMinutes: 10 },
  comment: { max: 20, windowMinutes: 10 },
} as const;

export type WriteKind = keyof typeof LIMITS;

/** Pure, so the arithmetic is checkable without a database. */
export function isOverLimit(recentCount: number, kind: WriteKind): boolean {
  return recentCount >= LIMITS[kind].max;
}

/**
 * Count the caller's writes inside the window.
 *
 * ponytail: one count query per write. Correct because it hits the shared
 * database. Move it into a BEFORE INSERT trigger if application code ever stops
 * being the only writer.
 */
export async function countRecentWrites(
  supabase: SupabaseClient,
  kind: WriteKind,
  userId: string,
): Promise<number> {
  const table = kind === "post" ? "posts" : "comments";
  const since = new Date(Date.now() - LIMITS[kind].windowMinutes * 60_000).toISOString();

  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId)
    .gt("created_at", since);

  if (error) {
    // Fail CLOSED. A rate limiter that opens when its own query breaks is not a
    // rate limiter.
    throw new Error(`rate limit check failed: ${error.message}`);
  }
  return count ?? 0;
}
