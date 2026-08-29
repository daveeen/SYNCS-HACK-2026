/**
 * The identity of a cached report. Owner: Yeriel.
 *
 * Its own module, with no imports beyond node:crypto, so `scripts/check.ts` can
 * assert on it offline. lib/report-cache.ts reaches Supabase through
 * lib/supabase/admin.ts, which carries `import "server-only"` and therefore
 * throws under plain Node: anything a script needs to test cannot live there.
 * That trap has bitten this repo three times.
 */
import { createHash } from "node:crypto";

/**
 * SHA-256 of model, normalised query, and sorted startup ids.
 *
 * The model is in the key so switching models is a fresh row rather than a
 * stale hit. Ids are SORTED because two rankings of the same five companies can
 * differ in order, and an unsorted key would miss the cache for a report that
 * is word for word identical. The query is lowercased and its whitespace
 * collapsed, so "Grocery delivery" and "grocery  delivery" share one row.
 */
export function cacheKey(
  model: string,
  query: string,
  matches: ReadonlyArray<{ id: string }>,
): string {
  const ids = matches.map((m) => m.id).sort().join(",");
  const normalised = query.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(`${model}\n${normalised}\n${ids}`).digest("hex");
}
