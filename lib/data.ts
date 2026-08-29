/**
 * The single place the app loads startup records from.
 *
 * Owner: Asher (the enriched JSON) / Yeriel (this loader).
 *
 * Resolution order:
 *   1. data/startups.enriched.json  — the real cargo, once the pipeline has run
 *   2. data/startups.mock.json      — 10 fake companies, always present
 *
 * Both files are STATICALLY IMPORTED, not read with fs. That is deliberate:
 * Vercel's file tracing does not reliably ship files that are only touched by
 * a runtime fs.readFileSync, and a demo that works locally but 404s the data
 * in production is the worst possible failure mode. Static import means the
 * bundler guarantees the data ships.
 *
 * Consequence: data/startups.enriched.json must always exist and always be
 * valid JSON. It starts life as an empty array `[]`.
 */
import "server-only";

import { ROOT_CAUSE_CATEGORIES } from "@/lib/types";
import type { FailedStartup, StartupVectors } from "@/lib/types";

import enriched from "@/data/startups.enriched.json";
import mock from "@/data/startups.mock.json";
import vectors from "@/data/startups.vectors.json";

/** True when we are serving invented placeholder companies, not real ones. */
export function isUsingMockData(): boolean {
  return (enriched as FailedStartup[]).length === 0;
}

/** Every startup available to the app. Never returns an empty array. */
/**
 * Records whose `rootCauseCategory` is missing or outside the vocabulary are
 * coerced to "unknown".
 *
 * The field arrived after the first 173 records were enriched, so real data can
 * legitimately predate it. Without this, `/api/report` groups on `undefined`
 * and can announce that N companies "died of the same thing: **undefined**" —
 * a fabricated pattern, which is the one output the report is built to never
 * produce. Coercing to "unknown" makes it say the causes are unrecorded, which
 * is true.
 *
 * Fix the data with `pnpm pipeline:categorize`; this is the safety net, not the
 * cure.
 */
const VALID_CATEGORIES = new Set<string>(ROOT_CAUSE_CATEGORIES);

function normalise(records: FailedStartup[]): FailedStartup[] {
  return records.map((r) =>
    VALID_CATEGORIES.has(r.rootCauseCategory)
      ? r
      : { ...r, rootCauseCategory: "unknown" as const },
  );
}

let cached: FailedStartup[] | null = null;

export function loadStartups(): FailedStartup[] {
  if (cached) return cached;
  const real = enriched as FailedStartup[];
  cached = normalise(real.length > 0 ? real : (mock as FailedStartup[]));
  return cached;
}

export function getStartupById(id: string): FailedStartup | undefined {
  return loadStartups().find((s) => s.id === id);
}

/**
 * Precomputed corpus vectors, keyed by startup id. Returns {} until
 * `pnpm pipeline:embed` has run — /api/search treats a missing vector as a
 * zero score rather than an error, so a half-embedded corpus degrades instead
 * of throwing.
 */
export function loadVectors(): StartupVectors {
  return vectors as StartupVectors;
}
