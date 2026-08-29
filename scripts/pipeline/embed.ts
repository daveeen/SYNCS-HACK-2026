/**
 * Pipeline step 3 of 3 — EMBED. Owner: Asher (runs it) / Yeriel (embed()).
 *
 *   ingest.ts  ->  enrich.ts  ->  embed.ts
 *
 * Precomputes one vector per startup so /api/search only has to embed the
 * user's query at request time. Writes the vectors back into the enriched
 * JSON, in place.
 *
 * Run:  pnpm pipeline:embed
 * In:   data/startups.enriched.json
 * Out:  data/startups.enriched.json  (+ an `embedding` field per record)
 *
 * STATUS: NOT IMPLEMENTED — blocked on embed() in lib/embed.ts.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FailedStartup } from "../../lib/types";

const FILE = path.join(process.cwd(), "data", "startups.enriched.json");

/**
 * The enriched record plus its precomputed vector.
 *
 * NOTE for whoever wires this up: `embedding` is an ADDITIVE field. It is not
 * in the FailedStartup contract, and it must never be sent to the browser —
 * 384 floats per record would dwarf the actual content. Strip it in
 * /api/search before responding.
 */
export type EmbeddedStartup = FailedStartup & { embedding: number[] };

/**
 * What text represents a startup for matching purposes. This choice is the
 * single biggest lever on match quality — more than the model is.
 *
 * TODO(Yeriel/Asher): tune this together, and use the SAME shape for the
 * query side. Matching a full description against a one-line user idea is an
 * asymmetry that quietly degrades results.
 */
function embeddingText(s: FailedStartup): string {
  return [s.name, s.tagline, s.description, s.industry].join(". ");
}

async function main() {
  const records = JSON.parse(await readFile(FILE, "utf8")) as FailedStartup[];
  if (records.length === 0) {
    console.log("embed: nothing to do — run pipeline:enrich first.");
    return;
  }

  // TODO: const vectors = await embed(records.map(embeddingText));
  void embeddingText;
  throw new Error(
    "embed.ts is not implemented yet — blocked on embed() in lib/embed.ts. Owner: Yeriel.",
  );

  // const out: EmbeddedStartup[] = records.map((r, i) => ({ ...r, embedding: vectors[i] }));
  // await writeFile(FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  // console.log(`embed: wrote ${out.length} vectors -> ${FILE}`);
}

void writeFile; // referenced by the commented-out write above

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
