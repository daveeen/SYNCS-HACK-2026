/**
 * Merge the fact-check patches into the corpus. Owner: Yeriel.
 *
 * Five agents verified records in parallel. They could not write
 * data/startups.enriched.json directly — 173 records live in one file, so
 * concurrent writers would corrupt it — so each wrote a patch and this merges
 * them in one pass.
 *
 * Run:  npx tsx scripts/apply-audit.ts          (dry run, prints what it would do)
 *       npx tsx scripts/apply-audit.ts --write  (applies)
 *
 * What it will change:
 *   - appends corroborating sources, deduplicated
 *   - fills waybackUrl for domains recovered by the domain agent
 *
 * What it will NOT change:
 *   - any prose. rootCause, proximateCause, timingNote and lesson are QA'd by
 *     Davin, and a fact-check that silently rewrites them is not a fact-check.
 *     Contradictions are REPORTED for a human to decide.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { FailedStartup } from "../lib/types";
import { toEmbeddableSnapshot, resolveLiveSnapshot } from "../lib/wayback";

const FILE = path.join(process.cwd(), "data", "startups.enriched.json");
const AUDIT = path.join(process.cwd(), "data", ".audit");

type Verdict = "confirmed" | "contradicted" | "unverifiable";
type Patch = { id: string; verdict: Verdict; newSources?: string[]; note?: string };
type DomainPatch = { id: string; domain: string; confidence: "high" | "low" | "none"; note?: string };

const write = process.argv.includes("--write");

function isHttp(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\/\S+$/.test(u);
}

/** Two sources from the same host are one source. That is the whole point. */
function host(u: string): string {
  try {
    return new URL(u).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

async function main(): Promise<void> {
  const records = JSON.parse(await readFile(FILE, "utf8")) as FailedStartup[];
  const byId = new Map(records.map((r) => [r.id, r]));

  const files = await readdir(AUDIT);
  const patches: Patch[] = [];
  let domains: DomainPatch[] = [];

  for (const f of files) {
    if (/^patch-\d+\.json$/.test(f)) {
      patches.push(...(JSON.parse(await readFile(path.join(AUDIT, f), "utf8")) as Patch[]));
    } else if (f === "patch-domains.json") {
      domains = JSON.parse(await readFile(path.join(AUDIT, f), "utf8")) as DomainPatch[];
    }
  }

  const contradicted: Patch[] = [];
  let sourcesAdded = 0;
  let recordsTouched = 0;

  for (const p of patches) {
    const r = byId.get(p.id);
    if (!r) {
      console.log(`  ?  unknown id in patch: ${p.id}`);
      continue;
    }
    if (p.verdict === "contradicted") contradicted.push(p);

    // Dedupe against the existing sources AND within the patch itself. Two URLs
    // from the same publisher are one source, and counting them as two inflates
    // exactly the corroboration number this script exists to report.
    const seen = new Set((r.sources ?? []).map(host));
    const fresh: string[] = [];
    for (const u of (p.newSources ?? []).filter(isHttp)) {
      if (seen.has(host(u))) continue;
      seen.add(host(u));
      fresh.push(u);
    }

    if (fresh.length > 0) {
      r.sources = [...(r.sources ?? []), ...fresh];
      sourcesAdded += fresh.length;
      recordsTouched++;
    }
  }

  // Domains: resolve a snapshot before writing anything. A domain that yields
  // no snapshot is worth nothing to us, and a wrong one would show a judge some
  // unrelated company's archived homepage.
  let waybackFilled = 0;
  for (const d of domains) {
    const r = byId.get(d.id);
    if (!r || r.waybackUrl || d.confidence === "none" || !d.domain) continue;

    const snapshot = await resolveLiveSnapshot(d.domain, r.diedYear);
    if (snapshot) {
      r.waybackUrl = toEmbeddableSnapshot(snapshot.snapshotUrl);
      waybackFilled++;
      console.log(`  wayback  ${r.name.padEnd(22)} ${d.domain} -> ${snapshot.timestamp}`);
    } else {
      console.log(`  no snap  ${r.name.padEnd(22)} ${d.domain}`);
    }
    await new Promise((res) => setTimeout(res, 1000));
  }

  const counts = patches.reduce<Record<string, number>>((acc, p) => {
    acc[p.verdict] = (acc[p.verdict] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\n--- audit summary ---");
  console.log("records checked :", patches.length);
  for (const [v, n] of Object.entries(counts)) console.log(`  ${v.padEnd(14)} ${n}`);
  console.log("sources added   :", sourcesAdded, `across ${recordsTouched} records`);
  console.log("waybackUrl filled:", waybackFilled);

  const single = records.filter((r) => (r.sources ?? []).length === 1).length;
  console.log("still single-sourced:", single, "of", records.length);

  if (contradicted.length > 0) {
    console.log("\n--- CONTRADICTED, needs a human decision ---");
    for (const c of contradicted) {
      console.log(`  ${byId.get(c.id)?.name ?? c.id}: ${c.note ?? "(no note)"}`);
    }
    console.log("\nNot auto-corrected. Prose is Davin's QA and Asher's data.");
  }

  if (!write) {
    console.log("\nDRY RUN — nothing written. Re-run with --write to apply.");
    return;
  }

  await writeFile(FILE, JSON.stringify(records, null, 2) + "\n", "utf8");
  console.log("\nwrote", FILE);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
