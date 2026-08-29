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
import { cosineSimilarity } from "../lib/embed";

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

  console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
