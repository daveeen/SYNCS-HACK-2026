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
import type { FailedStartup } from "@/lib/types";

import enriched from "@/data/startups.enriched.json";
import mock from "@/data/startups.mock.json";

/** True when we are serving invented placeholder companies, not real ones. */
export function isUsingMockData(): boolean {
  return (enriched as FailedStartup[]).length === 0;
}

/** Every startup available to the app. Never returns an empty array. */
export function loadStartups(): FailedStartup[] {
  const real = enriched as FailedStartup[];
  if (real.length > 0) return real;
  return mock as FailedStartup[];
}

export function getStartupById(id: string): FailedStartup | undefined {
  return loadStartups().find((s) => s.id === id);
}
