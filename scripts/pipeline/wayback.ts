/**
 * Pipeline step 4 — WAYBACK. Owner: Yeriel.
 *
 *   ingest.ts -> enrich.ts -> embed.ts -> wayback.ts
 *
 * Resolves a snapshot for every enriched record that does not already have one,
 * so /api/reconstruct reads a string out of JSON on stage rather than calling a
 * third-party API that has no posted rate limit and is known flaky under load.
 *
 * Run:  pnpm pipeline:wayback
 * In:   data/startups.enriched.json
 * Out:  data/startups.enriched.json   (fills waybackUrl ONLY, in place)
 *
 * Idempotent: records that already have a waybackUrl are skipped, so a rerun is
 * free, an interrupted run resumes, and hand-filled hero URLs are never
 * overwritten.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FailedStartup } from "../../lib/types";
import { resolveLiveSnapshot } from "../../lib/wayback";

const FILE = path.join(process.cwd(), "data", "startups.enriched.json");
const DOMAINS = path.join(process.cwd(), "data", "domains.json");

/** Politeness delay between archive.org calls. */
const DELAY_MS = 1000;

/**
 * The domain a company actually used.
 *
 * `FailedStartup` has no domain field and `sources` are article URLs, not the
 * company's own site — so the fallback is to guess `name + ".com"`. That works
 * for most and fails completely whenever the site differed from the name:
 * ContextLogic traded as wish.com, Twitter Fabric as get.fabric.io, Lily
 * Robotics as lily.camera.
 *
 * Those are researched by hand into data/domains.json and looked up first.
 * Only add an entry you have actually verified has a Wayback capture: a wrong
 * domain does not fail safely, it resolves to some unrelated company's archived
 * homepage, and we would show a judge the wrong website.
 */
function domainFor(s: FailedStartup, known: Record<string, string>): string {
  return known[s.id] ?? `${s.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const records = JSON.parse(await readFile(FILE, "utf8")) as FailedStartup[];
  const known = (JSON.parse(await readFile(DOMAINS, "utf8")) as { domains: Record<string, string> }).domains;

  if (records.length === 0) {
    console.log("wayback: nothing to do — run pnpm pipeline:enrich first.");
    return;
  }

  const missed: string[] = [];
  let resolved = 0;

  for (const record of records) {
    if (record.waybackUrl) continue;

    const domain = domainFor(record, known);
    // Aim at the year they died: that is the site as it last actually looked.
    const snapshot = await resolveLiveSnapshot(domain, record.diedYear);

    if (snapshot) {
      record.waybackUrl = snapshot.snapshotUrl;
      resolved++;
      console.log(`wayback: ${record.name} -> ${snapshot.timestamp}`);
    } else {
      missed.push(`${record.name} (tried ${domain})`);
    }

    // Checkpoint every record. An interrupted run keeps everything it found.
    await writeFile(FILE, JSON.stringify(records, null, 2) + "\n", "utf8");
    await sleep(DELAY_MS);
  }

  console.log(`\nwayback: resolved ${resolved}, missed ${missed.length}`);
  if (missed.length > 0) {
    console.log("\nNo snapshot found — hand-fill these if any are demo heroes:");
    for (const m of missed) console.log(`  - ${m}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
