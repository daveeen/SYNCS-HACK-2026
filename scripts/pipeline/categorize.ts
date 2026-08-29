/**
 * Pipeline step 2b — CATEGORIZE. Owner: Yeriel.
 *
 *   ingest -> enrich -> [categorize] -> embed -> wayback
 *
 * Backfills `rootCauseCategory` on records that predate the field.
 *
 * Why this exists as its own step: `rootCause` is rich prose (median ~440
 * characters here) and the report's "The pattern" section groups on a category,
 * because you cannot group free text. Keyword matching over these causes is
 * useless — only 6 of 173 happen to contain a taxonomy phrase — so the mapping
 * needs to be read, not matched.
 *
 * Run:  pnpm pipeline:categorize   (needs ANTHROPIC_API_KEY)
 * In/Out: data/startups.enriched.json  (fills rootCauseCategory only, in place)
 *
 * Idempotent: records that already carry a VALID category are skipped, so a
 * rerun is free, an interrupted run resumes, and hand-corrected values survive.
 *
 * A wrong category is worse than none. `/api/report` will announce that N
 * companies "died of the same thing", and a bad grouping makes that a lie — the
 * one output the report is built never to produce. So anything the model is not
 * confident about becomes "unknown", and the report then honestly says the
 * causes are unrecorded.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT_CAUSE_CATEGORIES } from "../../lib/types";
import type { FailedStartup, RootCauseCategory } from "../../lib/types";

const FILE = path.join(process.cwd(), "data", "startups.enriched.json");

/** Small enough that one bad batch costs little; large enough to amortise the prompt. */
const BATCH = 12;

const VALID = new Set<string>(ROOT_CAUSE_CATEGORIES);

const SYSTEM = `You classify why startups failed, into a fixed taxonomy.

You will be given numbered records, each with a company name and a written
account of why it died. For each, choose the ONE category that best describes
the ROOT cause — the disease, not the symptom.

The categories, and nothing else, are:
${ROOT_CAUSE_CATEGORIES.map((c) => `- ${c}`).join("\n")}

RULES
- "ran out of cash" is almost always the SYMPTOM. Use it only when the account
  gives no deeper reason than the money stopping.
- Acquired-then-shut-down, or killed by a parent company's strategy, is usually
  "no business model" or "out-competed" depending on why they sold. If neither
  fits, say "unknown".
- Choose "unknown" whenever the account does not clearly support one category.
  An honest "unknown" is far more useful to us than a confident guess: a wrong
  category makes a downstream report claim these companies share a cause when
  they do not.

OUTPUT
A JSON array, one object per record, in the order given, and nothing else:
[{"n": 1, "category": "out-competed"}, {"n": 2, "category": "unknown"}]`;

type Row = { n: number; category: string };

function parseRows(text: string): Row[] {
  // The model may wrap the array in prose or a fence despite instructions.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error(`no JSON array in response: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as Row[];
}

async function classify(
  client: Anthropic,
  batch: FailedStartup[],
): Promise<Map<string, RootCauseCategory>> {
  const prompt = batch
    .map((s, i) => `${i + 1}. ${s.name}\n${s.rootCause}`)
    .join("\n\n");

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const out = new Map<string, RootCauseCategory>();
  for (const row of parseRows(text)) {
    const record = batch[row.n - 1];
    if (!record) continue;
    // Anything outside the vocabulary is a failed classification, not a new
    // category. Treat it as unknown rather than writing a value the type
    // forbids and the report cannot group.
    const category = VALID.has(row.category) ? (row.category as RootCauseCategory) : "unknown";
    out.set(record.id, category);
  }
  return out;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "categorize: ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add it.",
    );
    process.exit(1);
  }

  const records = JSON.parse(await readFile(FILE, "utf8")) as FailedStartup[];
  if (records.length === 0) {
    console.log("categorize: nothing to do — run pnpm pipeline:enrich first.");
    return;
  }

  const todo = records.filter((r) => !VALID.has(r.rootCauseCategory) && r.rootCause);
  console.log(`categorize: ${todo.length} of ${records.length} need a category`);
  if (todo.length === 0) return;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const byId = new Map(records.map((r) => [r.id, r]));
  let done = 0;

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const results = await classify(client, batch);
      for (const [id, category] of results) {
        const record = byId.get(id);
        if (record) record.rootCauseCategory = category;
      }
      done += results.size;
    } catch (err) {
      // One bad batch must not cost the run. The records stay uncategorised and
      // a rerun picks them up.
      console.error(`categorize: batch at ${i} failed:`, err instanceof Error ? err.message : err);
    }

    // Checkpoint every batch. An interrupted run keeps everything it classified.
    await writeFile(FILE, JSON.stringify(records, null, 2) + "\n", "utf8");
    console.log(`categorize: ${done}/${todo.length}`);
  }

  const counts = new Map<string, number>();
  for (const r of records) {
    if (VALID.has(r.rootCauseCategory)) {
      counts.set(r.rootCauseCategory, (counts.get(r.rootCauseCategory) ?? 0) + 1);
    }
  }
  console.log("\ncategorize: distribution");
  for (const [c, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${c}`);
  }

  const stillUnknown = records.filter((r) => r.rootCauseCategory === "unknown").length;
  if (stillUnknown > 0) {
    console.log(
      `\n${stillUnknown} left as "unknown". That is a legal value — the report skips them ` +
        `rather than guessing. Spot-check a few before assuming the model was wrong.`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
