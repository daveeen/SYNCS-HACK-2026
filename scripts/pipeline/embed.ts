/**
 * Pipeline step 3 of 3 — EMBED. Owner: Asher (runs it) / Yeriel (embed()).
 *
 *   ingest.ts  ->  enrich.ts  ->  embed.ts
 *
 * Precomputes one vector per startup so /api/search only has to embed the
 * user's query at request time.
 *
 * Run:  pnpm pipeline:embed
 * In:   data/startups.enriched.json   (never modified)
 * Out:  data/startups.vectors.json    { "<id>": number[384] }
 *
 * Writes to a SEPARATE file rather than back into the enriched JSON: ~55 x 384
 * floats is roughly 420KB, and Davin's QA pass needs the enriched file to stay
 * readable and diffable. It also means a crash here can never corrupt Asher's
 * work — this script only ever reads its input.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FailedStartup, StartupVectors } from "../../lib/types";
import { embed, embeddingText } from "../../lib/embed";

const IN = path.join(process.cwd(), "data", "startups.enriched.json");
const OUT = path.join(process.cwd(), "data", "startups.vectors.json");

/** Small enough to checkpoint often, large enough to amortise model overhead. */
const BATCH = 16;

async function main(): Promise<void> {
  const records = JSON.parse(await readFile(IN, "utf8")) as FailedStartup[];

  if (records.length === 0) {
    console.log("embed: nothing to do — run pnpm pipeline:enrich first.");
    return;
  }

  const out: StartupVectors = {};

  for (let i = 0; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH);
    const vectors = await embed(slice.map(embeddingText));
    slice.forEach((record, j) => {
      out[record.id] = vectors[j];
    });

    // Checkpoint every batch. Losing an interrupted run costs one batch, not all of them.
    await writeFile(OUT, JSON.stringify(out) + "\n", "utf8");
    console.log(`embed: ${Object.keys(out).length}/${records.length}`);
  }

  console.log(`embed: wrote ${Object.keys(out).length} vectors -> ${OUT}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
