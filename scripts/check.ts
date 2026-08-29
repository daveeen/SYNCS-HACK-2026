/**
 * The one check script. Owner: Yeriel.
 *
 * No framework, on purpose (CLAUDE.md rule 8). Every non-trivial branch in the
 * backend leaves exactly one assert here. `pnpm check` + `pnpm build` is the
 * gate before any PR into develop.
 *
 * Run: pnpm check
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  cosineSimilarity,
  embed,
  embedOne,
  embeddingText,
  EMBEDDING_DIMS,
} from "../lib/embed";
import { rankByVector, rankByBM25 } from "../lib/search";
import { toEmbeddableSnapshot } from "../lib/wayback";
import { composeReport } from "../lib/report";
import { isValidHandle, HANDLE_RULE } from "../lib/forum/handle";
import { parseMentions } from "../lib/forum/mentions";
import { LIMITS, isOverLimit } from "../lib/forum/ratelimit";
import type { FailedStartup, StartupMatch, StartupVectors } from "../lib/types";

/** Mock records as matches, so the report checks need no data and no key. */
async function loadMatches(n: number): Promise<StartupMatch[]> {
  const mock = await loadMock();
  return mock.slice(0, n).map((s, i) => ({ ...s, similarity: 0.9 - i * 0.05 }));
}

/** The 10 invented companies. Used so checks run without Asher's data or a key. */
async function loadMock(): Promise<FailedStartup[]> {
  return JSON.parse(await readFile("data/startups.mock.json", "utf8")) as FailedStartup[];
}

let failed = 0;

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  await check("cosine: identical vectors score 1", () => {
    const v = [1, 2, 3, 4];
    assert.equal(Number(cosineSimilarity(v, v).toFixed(6)), 1);
  });

  await check("cosine: orthogonal vectors score 0", () => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  await check("cosine: a zero vector scores 0 rather than dividing by zero", () => {
    assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  });

  await check("cosine: length mismatch throws", () => {
    assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), /length mismatch/);
  });

  await check("embed: returns one vector per input, 384 dims", async () => {
    const [v] = await embed(["same-day grocery delivery"]);
    assert.equal(v.length, EMBEDDING_DIMS);
  });

  await check("embed: is deterministic across calls", async () => {
    const a = await embedOne("dead startup");
    const b = await embedOne("dead startup");
    assert.deepEqual(a, b);
  });

  await check("embed: normalised vectors have unit length", async () => {
    const v = await embedOne("anything at all");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    assert.equal(Number(norm.toFixed(4)), 1);
  });

  // The check that earns this file. It runs the FULL vector path — embeddingText
  // over the corpus, embedOne over the query, cosine, sort. An embeddingText
  // that drifts between the pipeline and the route fails here loudly, instead of
  // presenting as "the matches are mysteriously bad" at hour 30 with no stack
  // trace. If it fails, tune embeddingText — do not weaken the check.
  await check("vector path: a grocery idea ranks Fetchly first", async () => {
    const mock = await loadMock();

    const vectors: StartupVectors = {};
    const computed = await embed(mock.map(embeddingText));
    mock.forEach((record, i) => {
      vectors[record.id] = computed[i];
    });

    const queryVector = await embedOne(
      "an app that delivers groceries to your door the same day",
    );
    const [top] = rankByVector(queryVector, mock, vectors, 5);
    assert.equal(top.name, "Fetchly");
  });

  await check("vector path: a record with no vector scores 0, does not throw", async () => {
    const mock = await loadMock();
    const queryVector = await embedOne("anything");
    const ranked = rankByVector(queryVector, mock, {}, 5);
    assert.equal(ranked.length, 5);
    assert.equal(ranked[0].similarity, 0);
  });

  await check("bm25: sorted descending and inside [0,1]", async () => {
    const mock = await loadMock();
    const ranked = rankByBM25("grocery delivery logistics", mock, 5);
    assert.equal(ranked.length, 5);
    for (let i = 1; i < ranked.length; i++) {
      assert.ok(ranked[i - 1].similarity >= ranked[i].similarity, "not sorted");
    }
    assert.ok(ranked[0].similarity <= 1 && ranked[0].similarity >= 0);
  });

  await check("bm25: empty corpus returns [] rather than throwing", () => {
    assert.deepEqual(rankByBM25("anything", [], 5), []);
  });

  await check("report: names a shared root cause when two or more agree", async () => {
    const matches = await loadMatches(10);
    const md = composeReport("grocery delivery", matches);
    // mock has 3 x out-competed, the largest cluster
    assert.match(md, /3 of your 10 matches died of the same thing: \*\*out-competed\*\*/);
  });

  await check("report: refuses to invent a pattern when causes all differ", async () => {
    const matches = (await loadMatches(3)).map((m, i) => ({
      ...m,
      rootCauseCategory: (["no market need", "regulatory", "wrong team"] as const)[i],
    }));
    const md = composeReport("anything", matches);
    assert.match(md, /did not die of the same thing/);
    assert.doesNotMatch(md, /died of the same thing: \*\*/);
  });

  await check("report: one match is called an anecdote, not a pattern", async () => {
    const md = composeReport("anything", await loadMatches(1));
    assert.match(md, /one data point is an anecdote/);
  });

  await check("report: zero matches says so instead of fabricating", async () => {
    const md = composeReport("something nobody tried", []);
    assert.match(md, /Nothing in the graveyard matches this/);
    assert.doesNotMatch(md, /Who already tried it/);
  });

  await check("report: never prints an \"unknown\" field as though it were a fact", async () => {
    const matches = (await loadMatches(2)).map((m) => ({
      ...m,
      rootCause: "unknown",
      lesson: "unknown",
      timingNote: "unknown",
      fundingRaised: "unknown",
    }));
    const md = composeReport("anything", matches);
    assert.doesNotMatch(md, /unknown/i);
    assert.match(md, /Cause unrecorded/);
  });

  await check("wayback: snapshot URL becomes https and gains the if_ flag", () => {
    assert.equal(
      toEmbeddableSnapshot("http://web.archive.org/web/20160421075323/http://webvan.com/"),
      "https://web.archive.org/web/20160421075323if_/http://webvan.com/",
    );
  });

  await check("wayback: an already-embeddable URL is left alone", () => {
    const already = "https://web.archive.org/web/20160421075323if_/http://webvan.com/";
    assert.equal(toEmbeddableSnapshot(already), already);
  });

  await check("wayback: an empty string stays empty", () => {
    assert.equal(toEmbeddableSnapshot(""), "");
  });

  await check("handle: accepts lowercase, digits and underscore, 3-20 chars", () => {
    assert.equal(isValidHandle("yeriel"), true);
    assert.equal(isValidHandle("yeriel_1"), true);
    assert.equal(isValidHandle("a_b_c"), true);
  });

  await check("handle: rejects short, long, uppercase and punctuation", () => {
    assert.equal(isValidHandle("ab"), false);
    assert.equal(isValidHandle("a".repeat(21)), false);
    assert.equal(isValidHandle("Yeriel"), false);
    assert.equal(isValidHandle("a-b"), false);
    assert.equal(isValidHandle("a b"), false);
    assert.equal(isValidHandle(""), false);
  });

  // Reads the ACTUAL constraint out of supabase/schema.sql rather than
  // comparing against a second hardcoded copy. Asserting a literal against a
  // literal proves nothing: the whole risk is the schema and the route drifting
  // apart, and only one of them is in this repo's TypeScript.
  await check("handle: route regex is identical to the schema CHECK constraint", async () => {
    const sql = await readFile("supabase/schema.sql", "utf8");
    const m = sql.match(/check \(handle ~ '([^']+)'\)/);
    assert.ok(m, "could not find the handle CHECK constraint in supabase/schema.sql");
    assert.equal(HANDLE_RULE.source, m![1]);
  });
  await check("mentions: resolves @name against the corpus", async () => {
    assert.deepEqual(parseMentions("@fetchly died in 2018", await loadMock()), ["mock-001"]);
  });

  await check("mentions: normalises punctuation and spacing in names", async () => {
    assert.deepEqual(parseMentions("see @orbitalpost", await loadMock()), ["mock-009"]);
  });

  await check("mentions: drops an unknown handle rather than inventing a link", async () => {
    assert.deepEqual(parseMentions("@notacompany was great", await loadMock()), []);
  });

  await check("mentions: deduplicates a repeated mention", async () => {
    assert.deepEqual(parseMentions("@fetchly and again @fetchly", await loadMock()), ["mock-001"]);
  });

  // Without a leading boundary on the @, every post containing an email address
  // would silently link to a dead startup.
  await check("mentions: an email address is not a mention", async () => {
    assert.deepEqual(parseMentions("mail me at yeriel@fetchly.com", await loadMock()), []);
  });

  await check("ratelimit: allows under the cap, rejects at and above it", () => {
    assert.equal(isOverLimit(LIMITS.post.max - 1, "post"), false);
    assert.equal(isOverLimit(LIMITS.post.max, "post"), true);
    assert.equal(isOverLimit(LIMITS.post.max + 5, "post"), true);
    assert.equal(isOverLimit(0, "comment"), false);
  });


  console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
