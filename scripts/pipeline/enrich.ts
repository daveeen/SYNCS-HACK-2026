/**
 * Pipeline step 2 of 3 — ENRICH. Owner: Asher.
 *
 *   ingest.ts  ->  enrich.ts  ->  embed.ts
 *
 * Takes the raw rows and asks Claude for the analysis that makes this project
 * more than a spreadsheet: proximate cause vs ROOT cause, whether timing was
 * the real story, and the one-line lesson.
 *
 * Run:  pnpm pipeline:enrich   (needs ANTHROPIC_API_KEY)
 * In:   data/startups.raw.json
 * Out:  data/startups.enriched.json
 *
 * STATUS: NOT IMPLEMENTED.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FailedStartup } from "../../lib/types";
import type { RawStartup } from "./ingest";

const IN = path.join(process.cwd(), "data", "startups.raw.json");
const OUT = path.join(process.cwd(), "data", "startups.enriched.json");

/**
 * TODO(Asher):
 *  - Batch the raw rows and call Claude (ENRICH_MODEL in lib/claude.ts —
 *    Sonnet is plenty here; save Opus for the user-facing report).
 *  - Ask for STRICT JSON matching the four fields below. Validate the shape
 *    before writing; do not trust the model's formatting blindly.
 *  - THE HARD RULE (CLAUDE.md rule 3): the model must reason only from the
 *    supplied description and sources. If it cannot support a cause from
 *    those, the field is "unknown". A plausible invented reason is worse than
 *    a blank, because it survives review and then a judge asks about it.
 *  - Ask the model to distinguish the SYMPTOM ("ran out of cash" — nearly
 *    every dead startup runs out of cash) from the DISEASE. If rootCause and
 *    proximateCause come back identical, the enrichment failed: retry or flag.
 *  - Checkpoint to disk as you go. Do not lose an hour of API calls to a crash.
 */
type Enrichment = Pick<
  FailedStartup,
  "proximateCause" | "rootCause" | "timingNote" | "lesson"
>;

async function enrichOne(row: RawStartup): Promise<Enrichment> {
  void row;
  throw new Error("enrich.ts is not implemented yet. Owner: Asher.");
}

async function main() {
  const raw = JSON.parse(await readFile(IN, "utf8")) as RawStartup[];
  const out: FailedStartup[] = [];

  for (const row of raw) {
    const enrichment = await enrichOne(row);
    out.push({ ...row, ...enrichment, waybackUrl: "" });
  }

  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`enrich: wrote ${out.length} records -> ${OUT}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
