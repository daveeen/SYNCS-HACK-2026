# Graveyard Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three Graveyard route handlers for real — semantic search over ~55 dead startups, a streamed Claude diligence report, and Wayback reconstruction — replacing every stub.

**Architecture:** Local MiniLM embeds the query inside the Vercel function; cosine runs over precomputed vectors in a committed JSON file. The report is a separate streamed call to Claude Opus 5 so tombstones paint immediately. Wayback URLs are baked at pipeline time with a live fallback. Every route fails independently.

**Tech Stack:** Next.js 16 App Router · TypeScript · `@xenova/transformers` 2.17.2 (pinned) · `@anthropic-ai/sdk` · `tsx` for scripts. No test framework — one assert-based `scripts/check.ts`, per CLAUDE.md rule 8.

**Spec:** [docs/backend-spec.md](backend-spec.md). Where this plan and the spec disagree, the plan is newer — two amendments are called out in Task 0.

---

## Testing approach — read before Task 1

This repo has no test runner and is not getting one. Vitest, fixtures and per-function suites are exactly the scaffolding a 36-hour sprint cannot afford, and CLAUDE.md rule 8 says the simplest thing that demos wins.

The TDD loop here is:

1. Add a `check(...)` block to `scripts/check.ts` that asserts the behaviour
2. Run `pnpm check` — watch it fail with a real message
3. Implement
4. Run `pnpm check` — watch it pass
5. Commit

Same discipline, one file. Every non-trivial branch in the backend leaves exactly one assert behind. `pnpm check` plus `pnpm build` is the gate before any PR.

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `lib/types.ts` | the shared contract | modify — add 2 types, widen 1 |
| `lib/embed.ts` | text → vector, cosine, `embeddingText` | rewrite |
| `lib/search.ts` | ranking: vector primary, BM25 fallback | rewrite |
| `lib/wayback.ts` | snapshot URL shape + live lookup | **create** |
| `lib/data.ts` | load records and vectors | modify — add `loadVectors`, `server-only` |
| `lib/claude.ts` | Anthropic client | no change |
| `app/api/search/route.ts` | idea → ranked matches | rewrite |
| `app/api/report/route.ts` | streamed Claude report | rewrite |
| `app/api/reconstruct/route.ts` | Wayback snapshot | rewrite |
| `app/api/embed-smoke/route.ts` | deploy gate probe | create, then **delete in Task 10** |
| `scripts/fetch-model.ts` | one-off weight download | create |
| `scripts/check.ts` | the six asserts | create |
| `scripts/pipeline/embed.ts` | corpus vectors | rewrite |
| `scripts/pipeline/wayback.ts` | bake `waybackUrl` into records | **create** |
| `data/startups.vectors.json` | `{ id: number[384] }` | create as `{}` |
| `data/reports.planted.json` | `{ query: markdown }` | create as `{}` |
| `models/Xenova/all-MiniLM-L6-v2/` | committed weights | create, ~23MB |

`lib/wayback.ts` is an addition to the spec's module map. The spec put
`toEmbeddableSnapshot` in the route file; a route module is an awkward import
target for `scripts/check.ts`, and the Wayback logic is a genuinely separate
responsibility from HTTP handling.

---

## Task 0: Setup and two spec amendments

**Files:**
- Modify: `package.json`
- Modify: `lib/embed.ts:12` (remove one import)

- [ ] **Step 1: Install and confirm the baseline builds**

```bash
pnpm install
pnpm build
```

Expected: build succeeds. Next 16 generates `.next/types`, which `pnpm typecheck` needs. If the build fails here, stop — that is a pre-existing scaffold problem and nothing below will work.

- [ ] **Step 2: Create the branch**

`develop` does not exist on the remote yet (branches are `main`, `ash`, `landing-page`). Branch off it if Darryl has since created it, otherwise off `main`:

```bash
git fetch origin
git checkout develop 2>/dev/null || git checkout main
git pull
git checkout -b feat/api-backend
```

- [ ] **Step 3: Amendment 1 — remove `server-only` from `lib/embed.ts`**

`lib/embed.ts:12` currently has `import "server-only";`. That package throws when imported outside a React Server Component, and both `scripts/pipeline/embed.ts` and `scripts/check.ts` import `embed()` under plain Node via `tsx`. Left in place, `pnpm pipeline:embed` crashes on import before doing anything.

Delete the line. The guard stays on `lib/data.ts` and `lib/claude.ts`, neither of which any script imports.

```ts
// lib/embed.ts — DELETE this line:
import "server-only";
```

Replace it with a comment recording why, so nobody helpfully adds it back:

```ts
// No `server-only` guard here on purpose: scripts/pipeline/embed.ts and
// scripts/check.ts import embed() under plain Node, where that package throws.
// The guard lives on lib/data.ts and lib/claude.ts instead.
```

> **Tell Asher.** `scripts/pipeline/enrich.ts` will hit the identical wall the moment it imports `lib/claude.ts`, which does carry `server-only`. His fix is to construct the Anthropic client directly in the script rather than importing that module.

- [ ] **Step 4: Amendment 2 — add the two script entries**

In `package.json` `"scripts"`, add:

```json
"check": "tsx scripts/check.ts",
"fetch-model": "tsx scripts/fetch-model.ts",
```

- [ ] **Step 5: Commit**

```bash
git add package.json lib/embed.ts
git commit -m "chore(api): unblock scripts importing embed(), add check + fetch-model"
```

---

## Task 1: The check harness and the cosine asserts

`cosineSimilarity` is already implemented in the scaffold and is the one piece of maths everything else rests on. Pinning it first gives every later task somewhere to put its assert.

**Files:**
- Create: `scripts/check.ts`

- [ ] **Step 1: Write the failing checks**

Create `scripts/check.ts`:

```ts
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
```

- [ ] **Step 2: Run it**

```bash
pnpm check
```

Expected: four `ok` lines and `all checks passed`. These pass immediately because `cosineSimilarity` is already written — this step is verifying the harness itself runs, resolves the relative import, and exits 0.

If it exits non-zero on the maths, `cosineSimilarity` in `lib/embed.ts` is wrong and must be fixed before anything else.

- [ ] **Step 3: Commit**

```bash
git add scripts/check.ts
git commit -m "test(api): assert-based check harness, cosine similarity covered"
```

---

## Task 2: Download and commit the model weights

**Files:**
- Create: `scripts/fetch-model.ts`
- Create: `models/Xenova/all-MiniLM-L6-v2/**` (~23MB, committed)

- [ ] **Step 1: Write the fetch script**

Create `scripts/fetch-model.ts`:

```ts
/**
 * One-off: pull MiniLM weights into models/ so they can be committed.
 * Owner: Yeriel.
 *
 * This is the ONLY place allowRemoteModels is true. Run it once, commit the
 * output, and never run it again — production reads the committed copy.
 *
 * Run: pnpm fetch-model
 */
import path from "node:path";
import { pipeline, env } from "@xenova/transformers";

env.allowRemoteModels = true;
// NOT the default cache dir — /.cache is gitignored, and the whole point is to
// commit these files. transformers.js uses the same <org>/<model>/ layout for
// cacheDir and localModelPath, so models/ works as both.
env.cacheDir = path.join(process.cwd(), "models");

async function main(): Promise<void> {
  console.log("downloading Xenova/all-MiniLM-L6-v2 into models/ ...");
  await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });
  console.log("done — commit models/, and leave allowRemoteModels = false in lib/embed.ts");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

```bash
pnpm fetch-model
```

Expected: progress output, then `done`. Takes a minute or two on a decent connection.

- [ ] **Step 3: Verify the layout and size**

```bash
ls models/Xenova/all-MiniLM-L6-v2/
ls models/Xenova/all-MiniLM-L6-v2/onnx/
du -sh models/
```

Expected: `config.json`, `tokenizer.json`, `tokenizer_config.json` at the top level, `model_quantized.onnx` under `onnx/`, total roughly 23–30MB.

If `onnx/` contains a `model.onnx` of ~90MB instead, the `quantized: true` flag did not take. Delete `models/` and re-run — shipping the full-precision weights costs 90MB of repo and buys nothing.

- [ ] **Step 4: Confirm git will actually take them**

```bash
git status --short models/ | head -5
git check-ignore -v models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx || echo "not ignored — good"
```

Expected: files listed as untracked, and `not ignored — good`. If `.gitignore` were to swallow them, the build would work locally and 404 the model in production — the exact failure this task exists to prevent.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-model.ts models/
git commit -m "chore(api): commit MiniLM weights for offline embedding"
```

---

## Task 3: `embed()` and the deploy gate

**This task is the hour-2 spike.** Everything after it assumes the answer is yes.

**Files:**
- Modify: `lib/embed.ts`
- Create: `app/api/embed-smoke/route.ts` (deleted in Task 10)
- Modify: `next.config.ts`
- Modify: `scripts/check.ts`

- [ ] **Step 1: Write the failing checks**

Add to `scripts/check.ts` — new import at the top:

```ts
import { embed, embedOne, EMBEDDING_DIMS } from "../lib/embed";
```

And inside `main()`, after the cosine checks:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm check
```

Expected: the four cosine checks pass, the three embed checks FAIL with `embed() is not implemented yet. Owner: Yeriel.`

- [ ] **Step 3: Implement `lib/embed.ts`**

Replace the whole file:

```ts
/**
 * The embedding wrapper. Owner: Yeriel.
 *
 * The ONLY function in the codebase that turns text into a vector. The route
 * and the pipeline both call embed(); swapping MiniLM for a hosted provider
 * later means editing this file and nothing else.
 *
 * No `server-only` guard here on purpose: scripts/pipeline/embed.ts and
 * scripts/check.ts import embed() under plain Node, where that package throws.
 * The guard lives on lib/data.ts and lib/claude.ts instead.
 */
import path from "node:path";
import { pipeline, env } from "@xenova/transformers";
import type { FailedStartup } from "@/lib/types";

/** Model we standardised on: local, no API key, 384 dimensions. */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

// Weights ship in the repo. The default (allowRemoteModels = true) makes a cold
// lambda pull ~90MB from huggingface.co into /tmp on the judge's first query,
// over conference wifi. That is the single most likely way to lose the demo.
env.allowRemoteModels = false;
env.localModelPath = path.join(process.cwd(), "models");

/**
 * Structural type rather than the library's exported one — this pins the exact
 * surface we use and survives a types reshuffle in the package.
 */
type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

// Loading the model is slow. Cached across invocations; never per request.
let extractor: Extractor | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = (await pipeline("feature-extraction", EMBEDDING_MODEL, {
      quantized: true,
    })) as unknown as Extractor;
  }
  return extractor;
}

/**
 * What text represents a startup for matching purposes. The single biggest
 * lever on match quality — bigger than the model choice.
 *
 * Deliberately short: a founder types one line, and matching that against a
 * full multi-paragraph record is an asymmetry that degrades results badly.
 * proximateCause / rootCause / lesson are excluded on purpose — a founder
 * describes what a company DOES, not how it died, and including the failure
 * analysis pulls matches toward companies that died the same way rather than
 * companies that tried the same thing.
 *
 * This is a tuning knob. If matches look bad, change this before anything else
 * — and re-run `pnpm pipeline:embed`, because both sides must move together.
 */
export function embeddingText(s: FailedStartup): string {
  return [s.tagline, s.description.slice(0, 300), s.industry]
    .filter(Boolean)
    .join(". ");
}

/** Embed one or more strings. Returns one vector per input, in order. */
export async function embed(texts: string[]): Promise<number[][]> {
  const pipe = await getExtractor();
  const out = await pipe(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}

/** Convenience for the single-string case. */
export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1].
 * Pure maths, no dependencies.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
```

- [ ] **Step 4: Run the checks**

```bash
pnpm check
```

Expected: all seven pass.

If it fails with a module-resolution error on `@/lib/types`, `tsx` is not picking up the `paths` mapping. Change the `check` script to `"check": "tsx --tsconfig ./tsconfig.json scripts/check.ts"` and re-run.

- [ ] **Step 5: Add the file-tracing key**

In `next.config.ts`, inside `nextConfig`, alongside the existing `serverExternalPackages`:

```ts
  /**
   * The model weights live in models/ and are read at runtime by path. Next's
   * tracer follows imports, not fs paths, so without this it ships the code and
   * drops the weights: works locally, 404s the model in production.
   */
  outputFileTracingIncludes: {
    "/api/search": ["./models/**/*"],
    "/api/embed-smoke": ["./models/**/*"],
  },
```

- [ ] **Step 6: Add the smoke route**

Create `app/api/embed-smoke/route.ts`:

```ts
/**
 * TEMPORARY deploy gate. Owner: Yeriel. Delete in Task 10.
 *
 * Exists to answer one question before any other backend work: does a Vercel
 * function containing onnxruntime-node plus committed weights deploy at all,
 * or does it blow the 250MB unzipped limit?
 *
 * GET so it can be hit from a browser address bar.
 */
import { NextResponse } from "next/server";
import { embedOne, EMBEDDING_DIMS } from "@/lib/embed";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  const vector = await embedOne("same-day grocery delivery in the suburbs");
  return NextResponse.json({
    dims: vector.length,
    expected: EMBEDDING_DIMS,
    coldStartMs: Date.now() - started,
  });
}
```

- [ ] **Step 7: Verify it builds and runs locally**

```bash
pnpm build
pnpm dev
```

Then open `http://localhost:3000/api/embed-smoke`.

Expected: `{"dims":384,"expected":384,"coldStartMs":<number>}`.

- [ ] **Step 8: Commit and push — THE GATE**

```bash
git add lib/embed.ts next.config.ts app/api/embed-smoke/route.ts scripts/check.ts
git commit -m "feat(api): implement embed() with committed local MiniLM weights"
git push -u origin feat/api-backend
```

Watch the Vercel preview build, then hit `<preview-url>/api/embed-smoke`.

**Returns 384** → MiniLM is settled. Continue to Task 4. Note the `coldStartMs`; if it is over ~5000, mention it to Darryl so the results page can warm the function on page load.

**"A Serverless Function has exceeded the unzipped maximum size of 250 MB"** → this should not happen — the measured trace is roughly 70 MB on Vercel (see below). If it does, something changed: re-measure from the trace file first, work the exclusions listed below, and switch to the Supabase Edge fallback in [backend-spec.md §12](backend-spec.md) only if those do not get it under. Only `lib/embed.ts` changes shape either way; every task below stays as written. Tell Darryl the same hour.

### Measured size — the gate should pass comfortably

Do not measure this with `du` on node_modules. That counts whole packages on
disk and wildly overstates it; the tracer only pulls what is reachable. Read the
real answer out of the trace Next writes at build time:

```bash
pnpm build
node -e "const t=require('./.next/server/app/api/search/route.js.nft.json');console.log(t.files.length,'files traced')"
```

Deduped by realpath, the `/api/search` function traces to **53.4 MB** locally:

| | Traced |
|---|---|
| `sharp` (vendored libvips) | 27.4M |
| `models/` (weights) | 22.6M |
| `next` | 1.4M |
| `@xenova/transformers` | 0.8M |
| `onnxruntime-web` | 0.5M |
| `onnxruntime-node` | 0.2M |
| everything else | ~0.5M |
| **total** | **53.4M** |

On Vercel it lands near **70 MB**: the build runs on linux, so the tracer takes
`bin/napi-v3/linux/x64/libonnxruntime.so.1.14.0` (16.3M) in place of the 0.2M
win32 binding it picks locally. Against a 250 MB ceiling that is roughly 3.5x
headroom.

`sharp` being the single largest entry is galling — we never process an image —
but it is not worth removing. @xenova/transformers imports it at module load, so
the only ways out are patching the dependency's import graph or aliasing it to a
stub, and both risk breaking model loading to reclaim headroom that is already
there. Leave it.

If a future change does push this over, cut in this order, one at a time,
redeploying between each: `onnxruntime-web` (the WASM fallback, redundant once
the native binding works), then the non-linux `onnxruntime-node` prebuilds under
`bin/napi-v3/` — the exclusion from
[transformers.js#1164](https://github.com/huggingface/transformers.js/issues/1164).
Never `models/`; those 23M are the entire point of the design.

---

## Task 4: Types and the data loader

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/data.ts`
- Create: `data/startups.vectors.json`

- [ ] **Step 1: Create the empty vectors file**

```bash
echo '{}' > data/startups.vectors.json
```

It must exist and be valid JSON before anything imports it — same constraint `data/README.md` already documents for `startups.enriched.json`.

- [ ] **Step 2: Add the types**

In `lib/types.ts`, below `StartupMatch`:

```ts
/**
 * Precomputed corpus vectors, keyed by startup id. Lives in its own file
 * (data/startups.vectors.json) rather than joined onto FailedStartup: ~55 x 384
 * floats is around 420KB, and keeping it separate leaves the enriched file
 * readable for QA and makes it impossible to leak vectors to the browser.
 */
export type StartupVectors = Record<string, number[]>;

/** Where a Wayback snapshot came from. */
export type ReconstructSource = "baked" | "live" | "none";
```

And widen `ReconstructResponse`:

```ts
export type ReconstructResponse = {
  url: string;
  /** Wayback snapshot URL, or null if the archive has nothing. */
  snapshotUrl: string | null;
  /** Wayback timestamp, e.g. "20160421075323". */
  timestamp: string | null;
  available: boolean;
  /** Baked into the record at pipeline time, resolved live, or absent. */
  source: ReconstructSource;
};
```

- [ ] **Step 3: Update `lib/data.ts`**

Add to the imports at the top:

```ts
import "server-only";
```

and

```ts
import type { FailedStartup, StartupVectors } from "@/lib/types";
import vectors from "@/data/startups.vectors.json";
```

Then add at the bottom of the file:

```ts
/**
 * Precomputed corpus vectors, keyed by startup id. Returns {} until
 * `pnpm pipeline:embed` has run — /api/search treats a missing vector as a
 * zero score rather than an error, so a half-embedded corpus degrades instead
 * of throwing.
 */
export function loadVectors(): StartupVectors {
  return vectors as StartupVectors;
}
```

The `server-only` guard is safe here: every current importer (`app/page.tsx`, `app/graveyard/page.tsx`, `app/api/search/route.ts`) is server-side, and no script imports this module.

- [ ] **Step 4: Verify**

```bash
pnpm build
```

Expected: build succeeds. A `server-only` error here means something client-side imports `lib/data.ts` — find it and pass the value down as a prop instead.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/data.ts data/startups.vectors.json
git commit -m "feat(api): StartupVectors type, loadVectors(), server-only guard on data"
```

---

## Task 5: The pipeline embed step

**Files:**
- Modify: `scripts/pipeline/embed.ts` (full rewrite)

- [ ] **Step 1: Rewrite the script**

Replace `scripts/pipeline/embed.ts` entirely:

```ts
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
```

Not pretty-printed: the file is ~420KB and nobody reads it by hand.

- [ ] **Step 2: Run against the empty enriched file**

```bash
pnpm pipeline:embed
```

Expected: `embed: nothing to do — run pnpm pipeline:enrich first.` and exit 0. `data/startups.enriched.json` is still `[]` at this point, so this verifies the empty path without needing Asher's data.

- [ ] **Step 3: Run it for real against mock data**

Temporarily point it at the mock file to prove the loop works end to end:

```bash
node -e "const fs=require('fs');fs.copyFileSync('data/startups.enriched.json','/tmp/enriched.bak');fs.copyFileSync('data/startups.mock.json','data/startups.enriched.json')"
pnpm pipeline:embed
node -e "const v=require('./data/startups.vectors.json');console.log('ids',Object.keys(v).length,'dims',v['mock-001'].length)"
```

Expected: `embed: 10/10`, then `ids 10 dims 384`.

- [ ] **Step 4: Restore**

```bash
node -e "const fs=require('fs');fs.copyFileSync('/tmp/enriched.bak','data/startups.enriched.json');fs.writeFileSync('data/startups.vectors.json','{}\n')"
git diff --stat data/
```

Expected: no changes to `data/` — both files back to `[]` and `{}`. Committing mock vectors would make `isUsingMockData()` disagree with what search actually ranks.

- [ ] **Step 5: Commit**

```bash
git add scripts/pipeline/embed.ts
git commit -m "feat(data): pipeline:embed writes startups.vectors.json, checkpointed"
```

---

## Task 6: The two rankers

**Files:**
- Modify: `lib/search.ts` (full rewrite)
- Modify: `scripts/check.ts`

- [ ] **Step 1: Write the failing checks**

Add to the imports in `scripts/check.ts`:

```ts
import { readFile } from "node:fs/promises";
import { embeddingText } from "../lib/embed";
import { rankByVector, rankByBM25 } from "../lib/search";
import type { FailedStartup, StartupVectors } from "../lib/types";
```

And inside `main()`, after the embed checks:

```ts
  await check("vector path: a grocery idea ranks Fetchly first", async () => {
    const mock = JSON.parse(
      await readFile("data/startups.mock.json", "utf8"),
    ) as FailedStartup[];

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
    const mock = JSON.parse(
      await readFile("data/startups.mock.json", "utf8"),
    ) as FailedStartup[];
    const queryVector = await embedOne("anything");
    const ranked = rankByVector(queryVector, mock, {}, 5);
    assert.equal(ranked.length, 5);
    assert.equal(ranked[0].similarity, 0);
  });

  await check("bm25: sorted descending and inside [0,1]", async () => {
    const mock = JSON.parse(
      await readFile("data/startups.mock.json", "utf8"),
    ) as FailedStartup[];
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
```

The Fetchly check is the one that earns this file. It runs the *full* vector path — `embeddingText` on the corpus, `embedOne` on the query, cosine, sort — so an `embeddingText` that drifts between the pipeline and the route fails here loudly instead of presenting as "the matches are mysteriously bad" at hour 30.

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm check
```

Expected: the seven earlier checks pass; the four new ones FAIL with `rankByVector is not a function` or a module-resolution error on the missing export.

- [ ] **Step 3: Rewrite `lib/search.ts`**

```ts
/**
 * Matching. Owner: Yeriel.
 *
 * Two rankers. rankByVector is the real one. rankByBM25 exists only for when
 * embed() throws — /api/search sets `x-graveyard-degraded: true` whenever the
 * scores came from here, so a keyword result can never be presented as a
 * semantic one.
 */
import { cosineSimilarity } from "@/lib/embed";
import type { FailedStartup, StartupMatch, StartupVectors } from "@/lib/types";

const K1 = 1.5;
const B = 0.75;

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "how", "i", "in", "is", "it", "its", "of", "on", "or", "our", "that",
  "the", "their", "then", "there", "they", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "will", "with", "you", "your",
  "app", "startup", "platform", "product", "idea", "business", "company",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Everything a query could plausibly match against. Wider than
 * embeddingText() on purpose: the fallback has no semantics, so it needs every
 * literal token it can get.
 */
function haystack(s: FailedStartup): string {
  return [s.name, s.tagline, s.description, s.industry, s.rootCause, s.lesson].join(" ");
}

/**
 * The real matcher: cosine between the query vector and each precomputed
 * corpus vector.
 *
 * A record with no vector (or a mismatched one) scores 0 instead of throwing —
 * a half-embedded corpus should degrade, not 500.
 */
export function rankByVector(
  queryVector: number[],
  startups: FailedStartup[],
  vectors: StartupVectors,
  limit = 5,
): StartupMatch[] {
  return startups
    .map((s) => {
      const v = vectors[s.id];
      const raw =
        v && v.length === queryVector.length ? cosineSimilarity(queryVector, v) : 0;
      // The contract promises [0,1]; a normalised cosine can land marginally negative.
      return { ...s, similarity: Math.max(0, Math.min(1, raw)) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * The fallback, used only when embed() throws. Okapi BM25 over the corpus.
 */
export function rankByBM25(
  query: string,
  startups: FailedStartup[],
  limit = 5,
): StartupMatch[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || startups.length === 0) return [];

  const docs = startups.map((s) => tokenize(haystack(s)));
  const n = docs.length;
  const avgdl = docs.reduce((sum, d) => sum + d.length, 0) / n || 1;

  // ponytail: IDF recomputed per call. Fine over ~55 docs; cache the table if
  // the corpus ever passes a few thousand records.
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const raw = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const t of queryTokens) {
      const f = tf.get(t) ?? 0;
      if (f === 0) continue;
      const dfT = df.get(t) ?? 0;
      const idf = Math.log(1 + (n - dfT + 0.5) / (dfT + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avgdl)));
    }
    return score;
  });

  // BM25 is unbounded and the contract promises [0,1]. Normalising by the top
  // score keeps the ORDER honest and the range legal. These numbers are ranks,
  // not cosines — never compare them against a real similarity. The
  // x-graveyard-degraded header is what tells the UI which kind it got.
  const max = Math.max(...raw, 0);

  return startups
    .map((s, i) => ({ ...s, similarity: max > 0 ? raw[i] / max : 0 }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the checks**

```bash
pnpm check
```

Expected: all eleven pass.

If the Fetchly check fails, `embeddingText()` is the problem, not the ranker. Mock record `mock-001` is "Same-hour grocery delivery for the suburbs" — if that does not win against "an app that delivers groceries to your door the same day", tune `embeddingText` in `lib/embed.ts` and re-run. Do not weaken the check to make it pass; it is measuring the thing that matters.

- [ ] **Step 5: Commit**

```bash
git add lib/search.ts scripts/check.ts
git commit -m "feat(api): cosine ranker with BM25 fallback, drift check on the full vector path"
```

---

## Task 7: `POST /api/search` for real

**Files:**
- Modify: `app/api/search/route.ts` (full rewrite)

- [ ] **Step 1: Rewrite the route**

```ts
/**
 * POST /api/search — the core endpoint. Owner: Yeriel.
 *
 * Contract: SearchRequest in, SearchResponse out. See app/api/README.md and
 * docs/backend-spec.md §6.
 *
 * `report` is ALWAYS "" here. Reports come from POST /api/report, streamed, so
 * tombstones paint immediately instead of waiting on Claude.
 *
 * This route never touches Anthropic. An Anthropic outage costs the report and
 * nothing else.
 */
import { NextResponse } from "next/server";
import { loadStartups, loadVectors, isUsingMockData } from "@/lib/data";
import { embedOne } from "@/lib/embed";
import { rankByVector, rankByBM25 } from "@/lib/search";
import type { ApiError, SearchRequest, SearchResponse, StartupMatch } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_QUERY_CHARS = 500;

export async function POST(
  request: Request,
): Promise<NextResponse<SearchResponse | ApiError>> {
  let body: SearchRequest;
  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: `query must be ${MAX_QUERY_CHARS} characters or fewer` },
      { status: 400 },
    );
  }

  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.min(Math.max(Math.floor(body.limit), 1), 20)
      : 5;

  const startups = loadStartups();

  let matches: StartupMatch[];
  let degraded: string | null = null;

  try {
    const queryVector = await embedOne(query);
    matches = rankByVector(queryVector, startups, loadVectors(), limit);
  } catch (err) {
    // No retry: a cold start that already blew the budget will not succeed on a
    // second attempt inside the same invocation, and BM25 answers in single-digit ms.
    degraded = err instanceof Error ? err.name : "embed-failed";
    console.error("search: embed() failed, falling back to BM25:", err);
    matches = rankByBM25(query, startups, limit);
  }

  const headers: Record<string, string> = {
    "x-graveyard-mock-data": String(isUsingMockData()),
  };
  if (degraded) {
    headers["x-graveyard-degraded"] = "true";
    headers["x-graveyard-degraded-reason"] = degraded;
  }

  const payload: SearchResponse = { query, matches, report: "" };
  return NextResponse.json(payload, { headers });
}
```

`x-graveyard-stub` is gone — this endpoint is real now.

- [ ] **Step 2: Verify locally**

```bash
pnpm dev
```

In another terminal:

```bash
curl -s -D- -X POST http://localhost:3000/api/search \
  -H 'content-type: application/json' \
  -d '{"query":"an app that delivers groceries the same day","limit":3}'
```

Expected: `200`, **no** `x-graveyard-stub` header, `x-graveyard-mock-data: true`, and three matches with Fetchly first. `similarity` is 0 for all of them because `startups.vectors.json` is `{}` — that is correct and is exactly the degraded-but-alive row in the spec's failure matrix.

- [ ] **Step 3: Verify the validation boundary**

```bash
curl -s -X POST http://localhost:3000/api/search -H 'content-type: application/json' -d '{"query":"   "}'
curl -s -X POST http://localhost:3000/api/search -H 'content-type: application/json' -d "{\"query\":\"$(printf 'x%.0s' {1..600})\"}"
curl -s -X POST http://localhost:3000/api/search -H 'content-type: application/json' -d 'not json'
```

Expected, in order: `{"error":"query is required"}`, `{"error":"query must be 500 characters or fewer"}`, `{"error":"body must be valid JSON"}`.

- [ ] **Step 4: Verify the degraded path fires**

Temporarily break the model path to prove the fallback works rather than assuming it.

**Stop `pnpm dev` first.** `getExtractor()` caches the pipeline in a module-level variable, so a server that has already embedded once will keep serving from the cached model and the fallback will never fire — you would "verify" nothing.

```bash
# with the dev server stopped
mv models models.off
pnpm dev
```

Then in another terminal:

```bash
curl -s -D- -X POST http://localhost:3000/api/search \
  -H 'content-type: application/json' \
  -d '{"query":"grocery delivery","limit":3}' | head -20
```

Expected: `200` with `x-graveyard-degraded: true` and `x-graveyard-degraded-reason` set, and matches still returned. If it 500s instead, the try/catch is not wrapping the failure — fix before moving on. This is the branch that saves the demo, so it does not get to be untested.

Restore:

```bash
# stop pnpm dev again
mv models.off models
pnpm dev
```

- [ ] **Step 5: Commit**

```bash
git add app/api/search/route.ts
git commit -m "feat(api): real /api/search — cosine primary, BM25 degraded, stub header removed"
```

---

## Task 8: `POST /api/report` — streamed

**Files:**
- Modify: `app/api/report/route.ts` (full rewrite)
- Create: `data/reports.planted.json`

- [ ] **Step 1: Create the planted-reports file**

```bash
echo '{}' > data/reports.planted.json
```

Content is Davin's — his three planted ideas, keyed by the normalized query. The lookup is wired now so that adopting the fallback on stage is a data edit, not a code change.

- [ ] **Step 2: Rewrite the route**

```ts
/**
 * POST /api/report — Claude's diligence write-up for one idea. Owner: Yeriel.
 *
 * Returns a text/plain STREAM of Markdown, not JSON. See docs/backend-spec.md §7.
 * The client appends chunks to a string; there is no envelope because the
 * payload is one Markdown document.
 *
 * Never returns a canned report dressed as a real one. No key or a failed call
 * is a 500 and a visible error state — the tombstones are already on screen
 * from /api/search, so the demo degrades rather than dying.
 */
import { NextResponse } from "next/server";
import { getClaude, hasClaudeKey, REPORT_MODEL } from "@/lib/claude";
import plantedReports from "@/data/reports.planted.json";
import type { ApiError, ReportRequest, StartupMatch } from "@/lib/types";

export const runtime = "nodejs";

/** Hobby's ceiling. Raising this does nothing without a plan upgrade. */
export const maxDuration = 60;

const MAX_QUERY_CHARS = 500;
const MAX_MATCHES = 20;

const REPORT_SYSTEM = `You are a diligence analyst writing for a founder who has just described a
startup idea. You are given real failed startups matched to that idea. Tell them
what the graveyard says — specifically, and without flattery.

RULES
- Reason ONLY from the records in the user message. You have no other knowledge
  of these companies.
- A field reading "unknown" is unknown. Never fill a gap with a plausible guess.
- Name the companies. "Several startups have failed here" is worthless.
  "Webvan and Kozmo both died on the same density maths" is the product.
- Separate symptom from disease. Almost every dead startup ran out of cash. Say
  what made the cash run out.
- If the matches are weak or off-topic, say so in one sentence and write a
  shorter report. A manufactured pattern is worse than admitting there isn't one.
- No hedging, no "it's important to note", no closing pep talk.

OUTPUT
Markdown, exactly these four H2 sections, in order:

## The idea as we read it
One or two sentences, plainest possible terms. If the idea is ambiguous, say
which reading you took.

## Who already tried it
One bullet per matched company: name, years, what they actually did, what killed
them. Only companies from the supplied records.

## The pattern
The root cause these failures share, if they share one. If timing was the real
story, say so and say what has changed since. If they died of different things,
say that — a false pattern is worse than none.

## What would have to be different
The specific trap this founder is walking into, and what would have to be true
for their attempt to end differently. Concrete and testable, never "focus on
execution".`;

/**
 * Fields Claude sees. `sources` is excluded on purpose: the URLs are pure token
 * cost, the cards already display them, and a model handed URLs will eventually
 * emit a subtly wrong one.
 */
function forPrompt(m: StartupMatch) {
  return {
    name: m.name,
    tagline: m.tagline,
    description: m.description,
    industry: m.industry,
    foundedYear: m.foundedYear,
    diedYear: m.diedYear,
    fundingRaised: m.fundingRaised,
    proximateCause: m.proximateCause,
    rootCause: m.rootCause,
    timingNote: m.timingNote,
    lesson: m.lesson,
    similarity: Number(m.similarity.toFixed(3)),
  };
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

const STREAM_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
};

/** Serve a pre-written report through the same streaming interface. */
function streamString(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    { headers: STREAM_HEADERS },
  );
}

export async function POST(request: Request): Promise<Response | NextResponse<ApiError>> {
  let body: ReportRequest;
  try {
    body = (await request.json()) as ReportRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: `query must be ${MAX_QUERY_CHARS} characters or fewer` },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.matches)) {
    return NextResponse.json({ error: "matches must be an array" }, { status: 400 });
  }
  const matches = body.matches
    .slice(0, MAX_MATCHES)
    .filter((m) => m && typeof m.id === "string" && typeof m.name === "string");

  // Planted reports win over Claude. This is the plan's own fallback #3, and it
  // means adopting it on stage is a data edit rather than a code change.
  const planted = (plantedReports as Record<string, string>)[normalizeQuery(query)];
  if (planted) return streamString(planted);

  if (!hasClaudeKey()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set — no report can be generated" },
      { status: 500 },
    );
  }

  const userMessage = [
    `The founder's idea:\n\n${query}`,
    "",
    `Matched failed startups (JSON):\n\n${JSON.stringify(matches.map(forPrompt), null, 2)}`,
  ].join("\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const claudeStream = getClaude().messages.stream({
          model: REPORT_MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: REPORT_SYSTEM,
          messages: [{ role: "user", content: userMessage }],
        });

        claudeStream.on("text", (text) => {
          controller.enqueue(encoder.encode(text));
        });

        await claudeStream.finalMessage();
        controller.close();
      } catch (err) {
        // Headers are already sent, so this ends the stream early rather than
        // changing the status. The UI shows what it received and flags it.
        console.error("report: stream failed:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}
```

No `cache_control` anywhere: the system prompt is roughly 400 tokens and the minimum cacheable prefix is about 1024, so a breakpoint here would silently do nothing.

> **If `pnpm build` rejects `output_config` or `thinking` on the stream params**, the installed `@anthropic-ai/sdk` (`^0.71.0`) predates them in its types. Bump the SDK — `pnpm add @anthropic-ai/sdk@latest` — rather than deleting the parameters: `budget_tokens` is rejected outright on Opus 5, so there is no older-style thinking config to fall back to. If a bump is not acceptable mid-sprint, drop `output_config` only (effort defaults to `high`, meaning a longer pre-text pause) and keep `thinking`.

- [ ] **Step 3: Verify the no-key path**

With `ANTHROPIC_API_KEY` unset in `.env.local`:

```bash
curl -s -X POST http://localhost:3000/api/report \
  -H 'content-type: application/json' \
  -d '{"query":"grocery delivery","matches":[]}'
```

Expected: `{"error":"ANTHROPIC_API_KEY is not set — no report can be generated"}` with status 500. Never a canned report.

- [ ] **Step 4: Verify the planted path**

```bash
node -e "require('fs').writeFileSync('data/reports.planted.json', JSON.stringify({'grocery delivery':'## The idea as we read it\n\nplanted test report'}, null, 2))"
curl -s -N -X POST http://localhost:3000/api/report -H 'content-type: application/json' -d '{"query":"  GROCERY   Delivery ","matches":[]}'
node -e "require('fs').writeFileSync('data/reports.planted.json','{}\n')"
```

Expected: `planted test report` streams back. The mixed case and extra whitespace confirm `normalizeQuery` is doing its job.

- [ ] **Step 5: Verify the real Claude path**

Put a real key in `.env.local`, restart `pnpm dev`, then:

```bash
curl -s -N -X POST http://localhost:3000/api/report \
  -H 'content-type: application/json' \
  -d '{"query":"same-day grocery delivery in the suburbs","matches":[{"id":"mock-001","name":"Fetchly","tagline":"Same-hour grocery delivery for the suburbs","description":"Ran a fleet of contract drivers delivering supermarket orders within sixty minutes to low-density suburban postcodes.","industry":"Delivery / Logistics","foundedYear":2014,"diedYear":2018,"fundingRaised":"$21M","proximateCause":"ran out of cash","rootCause":"unit economics never worked at low population density","timingNote":"not a timing problem","lesson":"In delivery, geography is the business model.","sources":[],"waybackUrl":"","similarity":0.62}]}'
```

Expected: Markdown streams in progressively (`-N` disables curl buffering so you can see it arrive), with the four H2 sections in order.

**Time the gap before the first token.** Adaptive thinking with `display` omitted means silence until the first text block. If that gap is over ~5 seconds, drop `output_config` to `{ effort: "low" }`, or set `thinking: { type: "adaptive", display: "summarized" }` and let Darryl render the reasoning above the report as a deliberate flourish.

- [ ] **Step 6: Commit**

```bash
git add app/api/report/route.ts data/reports.planted.json
git commit -m "feat(api): streamed Claude diligence report with planted-report fallback"
```

---

## Task 9: `POST /api/reconstruct`

**Files:**
- Create: `lib/wayback.ts`
- Modify: `app/api/reconstruct/route.ts` (full rewrite)
- Modify: `scripts/check.ts`

- [ ] **Step 1: Write the failing check**

Add to the imports in `scripts/check.ts`:

```ts
import { toEmbeddableSnapshot } from "../lib/wayback";
```

And inside `main()`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm check
```

Expected: earlier checks pass, the three wayback checks FAIL — `lib/wayback.ts` does not exist.

- [ ] **Step 3: Create `lib/wayback.ts`**

```ts
/**
 * Wayback snapshot resolution. Owner: Yeriel.
 *
 * Separate from the route so scripts/check.ts can import the URL transform
 * without pulling in a route module.
 */

const AVAILABILITY_API = "https://archive.org/wayback/available";

/** Shape of the Availability API response. `archived_snapshots` is {} when nothing exists. */
type AvailabilityResponse = {
  archived_snapshots?: {
    closest?: { available?: boolean; url?: string; timestamp?: string; status?: string };
  };
};

export type LiveSnapshot = { snapshotUrl: string; timestamp: string } | null;

/**
 * Turn a Wayback URL into one that renders cleanly in an iframe.
 *
 * `if_` strips the Wayback toolbar and gives the closest thing to the original
 * page. Also upgrades the http the API hands back.
 *
 * Idempotent: a URL already carrying if_ passes through unchanged, so it is
 * safe to run over both live results and baked waybackUrl values.
 */
export function toEmbeddableSnapshot(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^http:\/\/web\.archive\.org/, "https://web.archive.org")
    .replace(/(\/web\/\d{14})(?!if_)\//, "$1if_/");
}

/**
 * Ask the Internet Archive for the closest snapshot.
 *
 * Never throws. archive.org publishes no rate limit but does return 429 under
 * load, so: 3s timeout, one retry, then give up. A null answer is a normal,
 * expected result — most dead startups have no usable snapshot.
 */
export async function resolveLiveSnapshot(url: string, year?: number): Promise<LiveSnapshot> {
  const params = new URLSearchParams({ url });
  if (year) params.set("timestamp", String(year));
  const endpoint = `${AVAILABILITY_API}?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) continue;
        return null;
      }
      const data = (await res.json()) as AvailabilityResponse;
      const closest = data.archived_snapshots?.closest;
      if (!closest?.available || !closest.url || !closest.timestamp) return null;
      return {
        snapshotUrl: toEmbeddableSnapshot(closest.url),
        timestamp: closest.timestamp,
      };
    } catch {
      // Timeout or network error. Fall through to the retry, then give up.
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the checks**

```bash
pnpm check
```

Expected: all fourteen pass.

- [ ] **Step 5: Rewrite the route**

```ts
/**
 * POST /api/reconstruct — pull a dead startup's old homepage out of the
 * Wayback Machine. Owner: Yeriel. This is the demo's "wow" moment.
 *
 * Contract: ReconstructRequest in, ReconstructResponse out. See
 * docs/backend-spec.md §8.
 *
 * Baked-first: the pipeline resolves waybackUrl for every record, so the demo
 * path reads a string out of JSON and makes zero network calls. The live
 * lookup exists for anything the pipeline missed.
 *
 * This route must never throw and must never break the results page.
 */
import { NextResponse } from "next/server";
import { loadStartups } from "@/lib/data";
import { toEmbeddableSnapshot, resolveLiveSnapshot } from "@/lib/wayback";
import type { ApiError, ReconstructRequest, ReconstructResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_URL_CHARS = 200;
const SAFE_URL = /^[a-z0-9.\-/:_%?=&]+$/i;

/** Strip protocol, www and trailing slash so a record match is possible. */
function bareDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** Pull the 14-digit timestamp out of a Wayback URL. */
function timestampOf(waybackUrl: string): string | null {
  return waybackUrl.match(/\/web\/(\d{14})/)?.[1] ?? null;
}

export async function POST(
  request: Request,
): Promise<NextResponse<ReconstructResponse | ApiError>> {
  let body: ReconstructRequest;
  try {
    body = (await request.json()) as ReconstructRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (url.length > MAX_URL_CHARS || !SAFE_URL.test(url)) {
    return NextResponse.json({ error: "url is not a valid domain or URL" }, { status: 400 });
  }

  const year =
    typeof body.year === "number" && Number.isInteger(body.year) &&
    body.year >= 1990 && body.year <= new Date().getFullYear()
      ? body.year
      : undefined;

  // 1. Baked — the demo path. No network.
  const domain = bareDomain(url);
  const record = loadStartups().find(
    (s) => s.waybackUrl && s.waybackUrl.toLowerCase().includes(domain),
  );
  if (record?.waybackUrl) {
    const snapshotUrl = toEmbeddableSnapshot(record.waybackUrl);
    return NextResponse.json({
      url,
      snapshotUrl,
      timestamp: timestampOf(snapshotUrl),
      available: true,
      source: "baked",
    });
  }

  // 2. Live — for anything the pipeline missed.
  const live = await resolveLiveSnapshot(url, year);
  if (live) {
    return NextResponse.json({
      url,
      snapshotUrl: live.snapshotUrl,
      timestamp: live.timestamp,
      available: true,
      source: "live",
    });
  }

  // 3. Nothing. A normal, expected answer — HTTP 200, not an error.
  return NextResponse.json({
    url,
    snapshotUrl: null,
    timestamp: null,
    available: false,
    source: "none",
  });
}
```

- [ ] **Step 6: Verify against the live archive**

```bash
curl -s -X POST http://localhost:3000/api/reconstruct \
  -H 'content-type: application/json' -d '{"url":"webvan.com","year":2000}'
```

Expected: `available: true`, `source: "live"`, and a `snapshotUrl` containing `if_/`. No `x-graveyard-stub` header.

- [ ] **Step 7: Verify the nothing-found and validation paths**

```bash
curl -s -X POST http://localhost:3000/api/reconstruct -H 'content-type: application/json' -d '{"url":"thisdomaindoesnotexistanywhere12345.com"}'
curl -s -X POST http://localhost:3000/api/reconstruct -H 'content-type: application/json' -d '{"url":"has spaces and <script>"}'
curl -s -X POST http://localhost:3000/api/reconstruct -H 'content-type: application/json' -d '{"url":"webvan.com","year":"not a number"}'
```

Expected: a 200 with `available: false, source: "none"`; then a 400 `url is not a valid domain or URL`; then a normal 200 — a bad `year` is ignored, never a 400.

- [ ] **Step 8: Commit**

```bash
git add lib/wayback.ts app/api/reconstruct/route.ts scripts/check.ts
git commit -m "feat(api): Wayback reconstruction — baked first, live fallback, if_ embed form"
```

---

## Task 10: Bake `waybackUrl` into the records

Without this step nothing ever populates `waybackUrl`, and `/api/reconstruct`
falls through to the live archive on every single request — which is the exact
dependency the baked-first design exists to remove. `enrich.ts` hard-sets the
field to `""`; `embed.ts` writes vectors. This is the missing step.

**Files:**
- Create: `scripts/pipeline/wayback.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

Create `scripts/pipeline/wayback.ts`:

```ts
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
 * free and an interrupted run resumes where it stopped.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FailedStartup } from "../../lib/types";
import { resolveLiveSnapshot } from "../../lib/wayback";

const FILE = path.join(process.cwd(), "data", "startups.enriched.json");

/** Politeness delay between archive.org calls. */
const DELAY_MS = 1000;

/**
 * Best guess at a dead company's domain. FailedStartup has no domain field and
 * `sources` are article URLs, not the company's own site, so the name is all we
 * have. A wrong guess costs one wasted request and leaves waybackUrl empty —
 * which is a legal value the UI already handles.
 */
function guessDomain(s: FailedStartup): string {
  return `${s.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const records = JSON.parse(await readFile(FILE, "utf8")) as FailedStartup[];

  if (records.length === 0) {
    console.log("wayback: nothing to do — run pnpm pipeline:enrich first.");
    return;
  }

  const missed: string[] = [];
  let resolved = 0;

  for (const record of records) {
    if (record.waybackUrl) continue;

    const domain = guessDomain(record);
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
```

- [ ] **Step 2: Add the script entry**

In `package.json` `"scripts"`, add `pipeline:wayback` and extend the chain:

```json
"pipeline:wayback": "tsx scripts/pipeline/wayback.ts",
"pipeline": "pnpm pipeline:ingest && pnpm pipeline:enrich && pnpm pipeline:embed && pnpm pipeline:wayback",
```

- [ ] **Step 3: Verify against the empty enriched file**

```bash
pnpm pipeline:wayback
```

Expected: `wayback: nothing to do — run pnpm pipeline:enrich first.` and exit 0.

- [ ] **Step 4: Verify the resolution loop on real dead companies**

The mock records are invented companies with no archive presence, so they prove nothing. Use a throwaway file of genuinely dead startups instead:

```bash
node -e "
const fs=require('fs');
fs.copyFileSync('data/startups.enriched.json','/tmp/enriched.bak');
const rows=[
  {id:'t1',name:'Webvan',diedYear:2001,waybackUrl:''},
  {id:'t2',name:'Kozmo',diedYear:2001,waybackUrl:''},
  {id:'t3',name:'Theranos',diedYear:2018,waybackUrl:''}
];
fs.writeFileSync('data/startups.enriched.json',JSON.stringify(rows,null,2));
"
pnpm pipeline:wayback
node -e "console.log(require('./data/startups.enriched.json').map(r=>r.name+': '+(r.waybackUrl||'MISS')).join('\n'))"
```

Expected: at least Webvan resolves to a `web.archive.org/web/<14 digits>if_/` URL. Some will miss — that is the normal outcome the `missed` list exists to surface, and exactly why the heroes get hand-filled.

- [ ] **Step 5: Restore**

```bash
node -e "require('fs').copyFileSync('/tmp/enriched.bak','data/startups.enriched.json')"
git diff --stat data/
```

Expected: no changes under `data/`.

- [ ] **Step 6: Verify `/api/reconstruct` takes the baked path**

With a record in place that has a `waybackUrl`, the baked branch is finally reachable:

```bash
node -e "
const fs=require('fs');
fs.copyFileSync('data/startups.enriched.json','/tmp/enriched.bak');
fs.writeFileSync('data/startups.enriched.json',JSON.stringify([{
  id:'t1',name:'Webvan',tagline:'Online grocery',description:'x',industry:'Delivery',
  foundedYear:1996,diedYear:2001,fundingRaised:'\$396M',proximateCause:'ran out of cash',
  rootCause:'built warehouses before demand',timingNote:'too early',lesson:'x',
  sources:['https://example.com'],
  waybackUrl:'http://web.archive.org/web/20010801000000/http://webvan.com/'
}],null,2));
"
# restart pnpm dev — data/ is statically imported, so the running server holds the old copy
curl -s -X POST http://localhost:3000/api/reconstruct -H 'content-type: application/json' -d '{\"url\":\"webvan.com\"}'
node -e "require('fs').copyFileSync('/tmp/enriched.bak','data/startups.enriched.json')"
```

Expected: `"source":"baked"`, `"available":true`, and a `snapshotUrl` containing `if_/` — proving the transform runs over baked values too, not just live ones. Restart `pnpm dev` again after restoring.

- [ ] **Step 7: Commit**

```bash
git add scripts/pipeline/wayback.ts package.json
git commit -m "feat(data): pipeline:wayback bakes snapshot URLs, idempotent and checkpointed"
```

---

## Task 11: Cleanup, docs, and the team announcement

**Files:**
- Delete: `app/api/embed-smoke/route.ts`
- Modify: `next.config.ts`
- Modify: `app/api/README.md`
- Modify: `data/README.md`

- [ ] **Step 1: Delete the smoke route and its tracing entry**

```bash
rm -rf app/api/embed-smoke
```

In `next.config.ts`, drop the `"/api/embed-smoke"` line from `outputFileTracingIncludes`, leaving only `"/api/search"`.

- [ ] **Step 2: Update the API contract doc**

In `app/api/README.md`:

- Delete the **Stub headers** section's claim that every endpoint is stubbed. Replace with a table documenting `x-graveyard-mock-data` and `x-graveyard-degraded` / `x-graveyard-degraded-reason`.
- Under `/api/search`, replace the "Now / Later" lines with: matches are cosine over precomputed vectors, `report` is always `""`.
- Resolve the open question at the end of the `/api/search` section: the report is a separate call. Delete the question.
- Under `/api/report`, replace the JSON response block with the `text/plain` streaming contract.
- Under `/api/reconstruct`, add `source` to the response example.

- [ ] **Step 3: Update the data doc**

In `data/README.md`, add `startups.vectors.json` and `reports.planted.json` to the file table, and correct the flow diagram: `pipeline:embed` reads the enriched file and writes `startups.vectors.json` rather than modifying its input.

- [ ] **Step 4: Full verification before the PR**

```bash
pnpm check
pnpm build
pnpm lint
```

Expected: fourteen checks pass, build succeeds, lint clean.

Then click the demo path by hand — landing → paste an idea → results — per repo rule 7. A green build that broke the demo is still a broken merge.

- [ ] **Step 5: Commit and open the PR**

```bash
git add -A
git commit -m "docs(api): contract docs match the shipped routes; drop the deploy-gate route"
git push
```

Open a PR into `develop` (or `main` if `develop` still does not exist).

- [ ] **Step 6: Post the contract changes to team chat**

Required by CLAUDE.md rule 5, before merge. One message, all six:

```
Backend routes are real. Six contract changes, all in docs/backend-spec.md §9:

1. /api/search now always returns report: "" — reports come from /api/report.
   Type unchanged, semantics moved. This resolves the open question in
   app/api/README.md.  → Darryl
2. /api/report returns a text/plain STREAM of Markdown, not ReportResponse JSON.
   Read it with `for await (const chunk of res.body)`.  → Darryl
3. New header x-graveyard-degraded: true (+ -reason) when matches came from the
   BM25 fallback instead of embeddings. Needs a visible badge, same as the stub
   badge — it is what stops us showing keyword matches as semantic ones.  → Sam
4. next.config.ts gains outputFileTracingIncludes so the model weights ship.
   Shared root file.  → everyone
5. ReconstructResponse gains source: "baked" | "live" | "none". Additive.  → Sam
6. pipeline:embed now writes data/startups.vectors.json instead of adding an
   embedding field to startups.enriched.json. Enriched file stays readable for
   QA and is never modified by the embed step.  → Asher, Davin
7. New pipeline step: pnpm pipeline:wayback, which fills the waybackUrl field
   on enriched records (and ONLY that field). It is the last step in
   `pnpm pipeline`, idempotent, and skips records that already have one — so
   hand-filled hero URLs are never overwritten. It guesses the domain from the
   company name, so expect misses; it prints them at the end for hand-filling.
   Without this, /api/reconstruct hits archive.org live on every request during
   the pitch.  → Asher, Davin

8. pnpm-workspace.yaml: sharp moved from ignoredBuiltDependencies to
   onlyBuiltDependencies. @xenova/transformers declares sharp a HARD dependency
   and imports it at module load, so with its native binary unbuilt every import
   of transformers threw. This broke on a fresh clone and would have broken the
   Vercel build. Pull and reinstall.  → everyone
9. @anthropic-ai/sdk bumped 0.71 -> 0.122. The pinned version had no
   output_config on the non-beta messages surface and no adaptive variant of
   thinking, so /api/report could not compile. budget_tokens is a 400 on Opus 5,
   so there was no older-style config to fall back to.  → everyone

Also: models/ adds ~23MB to the repo, so your next clone is slower.

Darryl — app/graveyard/ResultsClient.tsx needs two changes and I did not make
them, it is your file:
  - line ~47 reads the x-graveyard-stub header to decide whether to show the
    "do not demo this" badge. That header is gone now. Key the badge off
    x-graveyard-degraded instead, so it fires when matches came from the BM25
    fallback rather than from embeddings.
  - line ~109 renders {report} from the search response, which is now always "".
    The report comes from POST /api/report as a text/plain stream. Until you
    wire that up the report section renders blank. Everything else on the page
    works.

And Asher — heads up, lib/claude.ts has `import "server-only"`, which throws
under plain Node. If enrich.ts imports it the script dies on import. Construct
the Anthropic client directly in the script instead. I hit the same thing with
lib/embed.ts.
```

---

## Definition of done

- [ ] `pnpm check` — fourteen checks pass
- [ ] `pnpm build` — succeeds
- [ ] `pnpm lint` — clean
- [ ] `/api/search` returns cosine-ranked matches, no stub header
- [ ] Killing `models/` produces a degraded-but-working search with the header set
- [ ] `/api/report` streams Markdown from Claude, and 500s honestly without a key
- [ ] `/api/reconstruct` returns an `if_` snapshot URL for a known dead domain
- [ ] `/api/reconstruct` returns `source: "baked"` for a record with a `waybackUrl`
- [ ] `pnpm pipeline:wayback` resolves a snapshot for at least one real dead company
- [ ] Demo path clicks through: landing → paste idea → results
- [ ] Seven contract changes posted to team chat
- [ ] `app/api/README.md` and `data/README.md` describe what actually ships
