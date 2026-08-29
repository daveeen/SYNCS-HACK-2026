/**
 * The report cache. Owner: Yeriel.
 *
 * One Claude call per distinct (model, idea, match set). Everything after the
 * first is served from Postgres, so a judge retyping the demo query gets an
 * instant answer and costs nothing, and the row doubles as the log of exactly
 * what Claude was given.
 *
 * EVERY FUNCTION HERE IS BEST EFFORT. A cache that can break the product is
 * worse than no cache: if Supabase is unconfigured, unreachable or has never
 * had schema.sql applied, these return null / do nothing and the route calls
 * Claude as though the cache did not exist. Failures are logged once and
 * swallowed.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { StartupMatch } from "@/lib/types";

export { cacheKey } from "@/lib/report-key";

export type CachedReport = { report: string; model: string; createdAt: string };

/** True when the service-role client can even be built. */
function configured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** A previously written report, or null for any reason at all. */
export async function readCachedReport(key: string): Promise<CachedReport | null> {
  if (!configured()) return null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("report_cache")
      .select("report, model, created_at")
      .eq("cache_key", key)
      .maybeSingle();

    if (error) {
      console.error("report-cache: read failed, falling through to Claude:", error.message);
      return null;
    }
    if (!data) return null;

    // Awaited, for the same reason writeCachedReport is: a serverless function
    // can be frozen the instant the response is returned, so an un-awaited RPC
    // is usually killed mid-flight and hit_count would sit at 0 forever, making
    // the log column useless in exactly the environment it matters. One UPDATE
    // against a primary key, on a path that has already skipped a model call.
    const { error: rpcError } = await supabase.rpc("touch_report_cache", { key });
    if (rpcError) console.error("report-cache: touch failed:", rpcError.message);

    return { report: data.report, model: data.model, createdAt: data.created_at };
  } catch (err) {
    console.error("report-cache: read threw:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Store a freshly generated report. Never throws, never blocks the response on
 * a failure: the user already has their report by the time this runs.
 *
 * Upsert rather than insert, because two identical queries can race past the
 * read and both generate. Second writer wins, and the report is equivalent
 * either way.
 */
export async function writeCachedReport(entry: {
  key: string;
  query: string;
  matches: StartupMatch[];
  model: string;
  report: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  if (!configured()) return;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("report_cache").upsert(
      {
        cache_key: entry.key,
        query: entry.query,
        startup_ids: entry.matches.map((m) => m.id),
        model: entry.model,
        report: entry.report,
        input_tokens: entry.inputTokens ?? null,
        output_tokens: entry.outputTokens ?? null,
      },
      { onConflict: "cache_key" },
    );
    if (error) console.error("report-cache: write failed:", error.message);
  } catch (err) {
    console.error("report-cache: write threw:", err instanceof Error ? err.message : err);
  }
}
