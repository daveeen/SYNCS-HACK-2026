/**
 * Pipeline step 1 of 3 — INGEST. Owner: Asher.
 *
 *   ingest.ts  ->  enrich.ts  ->  embed.ts
 *
 * Reads the raw seed source(s) and emits a normalised, deduped list of
 * candidate startups with the fields we can get WITHOUT Claude. Everything
 * Claude has to reason about (rootCause, timingNote, lesson) stays empty here.
 *
 * Run:  pnpm pipeline:ingest
 * Out:  data/startups.raw.json
 *
 * STATUS: NOT IMPLEMENTED. See data/README.md for the seed sources.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { FailedStartup } from "../../lib/types";

/** What ingest can fill in. The rest is enrich.ts's job. */
export type RawStartup = Pick<
  FailedStartup,
  | "id"
  | "name"
  | "tagline"
  | "description"
  | "industry"
  | "foundedYear"
  | "diedYear"
  | "fundingRaised"
  | "sources"
>;

const OUT = path.join(process.cwd(), "data", "startups.raw.json");

/**
 * TODO(Asher):
 *  1. Pull the seed CSV (CB Insights 483 / Kaggle mirror — see data/README.md).
 *  2. Normalise column names into RawStartup.
 *  3. Dedupe by lowercased name.
 *  4. Drop any row with no usable source URL. `sources` must never be empty —
 *     an entry we cannot cite is an entry we cannot defend to a judge.
 *  5. Unknown scalar fields become the string "unknown", never a guess.
 */
async function ingest(): Promise<RawStartup[]> {
  throw new Error("ingest.ts is not implemented yet. Owner: Asher.");
}

async function main() {
  const rows = await ingest();
  await writeFile(OUT, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`ingest: wrote ${rows.length} rows -> ${OUT}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
