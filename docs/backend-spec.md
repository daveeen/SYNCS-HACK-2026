# Backend spec — route handlers, embeddings, Wayback

Owner: **Yeriel**. Tie-breaker on contract changes: **Darryl**.
Scope: `app/api/*`, `lib/{types,embed,search,data,claude}.ts`, the `embed()` half of
`scripts/pipeline/embed.ts`, and `scripts/check.ts`.

Not in scope: UI, the enrichment pipeline's Claude prompt (Asher), seed curation
(Davin), deploy config beyond the two `next.config.ts` keys called out in §3.

This document is downstream of [GRAVEYARD_TEAM_PLAN.md](../GRAVEYARD_TEAM_PLAN.md)
and [app/api/README.md](../app/api/README.md). Where it disagrees with the API
README, this file wins and the README gets updated — but §9 has to be announced
in team chat first.

---

## 0. Decisions, and what they cost

| Decision | Chosen | Rejected because |
|---|---|---|
| Query encoder | **Local MiniLM inside the Vercel function** | Supabase Edge blocks Asher's pipeline on a deployed service; Railway splits the deploy; browser-side moves 23MB and its loading UI into Sam and Darryl's files |
| Vector store | **A JSON file and a `for` loop** | At n≈55, cosine is microseconds. pgvector's index does not engage below thousands of rows. A vector DB earns nothing |
| Report delivery | **Separate call, streamed** | Inline means nothing renders for 5–15s and no headroom under Hobby's 60s ceiling |
| Wayback | **Baked at pipeline time, live only as fallback** | Betting a 90-second pitch on a third-party API with no posted rate limit |
| `embed()` failure | **BM25 fallback, loudly flagged** | Hard-fail loses the reveal to one cold start; silent fallback demos keyword matches as if they were semantic |
| Report model | **`claude-opus-5`** | Already set in `lib/claude.ts`. Streaming removes the latency argument for Sonnet |

**The MiniLM choice is provisional until the hour-2 spike (§12) passes.** If the
function blows Vercel's 250MB unzipped limit, §12 says exactly what to do instead.

---

## 1. Architecture

```
POST /api/search  {query, limit}                        target <300ms warm
  |
  +- embed(query) ---> MiniLM, local weights, module-cached pipeline
  |     |
  |     +- throws ---> rankByBM25()  +  x-graveyard-degraded: true
  |
  +- cosine vs ~55 precomputed vectors      plain JS loop, sub-millisecond
  |
  +- { query, matches, report: "" }         report deliberately empty

POST /api/report  {query, matches}          text/plain stream, maxDuration 60
  |
  +- planted-report lookup (normalized query) --> hit: stream from disk
  +- miss --> claude-opus-5, streamed text deltas

POST /api/reconstruct  {url, year}                      target <50ms
  |
  +- record.waybackUrl        baked by the pipeline, zero network
  +- empty ---> archive.org availability, 3s timeout, 1 retry, never throws
```

**Isolation is the point.** `/api/search` never touches Anthropic.
`/api/report` never touches ONNX. `/api/reconstruct` blocks neither. One route
down is a degraded demo, never a dead one.

---

## 2. Module map

| File | The one job | Change |
|---|---|---|
| `lib/types.ts` | the contract | add `StartupVectors`, `ReconstructSource`; widen `ReconstructResponse` |
| `lib/embed.ts` | text → vector, and cosine | implement `embed()`; **`embeddingText()` moves here** |
| `lib/search.ts` | ranking | `rankByVector` (primary) + `rankByBM25` (fallback) |
| `lib/data.ts` | load records and vectors | add `loadVectors()`, add `import "server-only"` |
| `lib/claude.ts` | Anthropic client + model ids | none — already correct |
| `scripts/pipeline/embed.ts` | write vectors | imports `embeddingText` from `lib/embed.ts`; writes a **separate** file |
| `scripts/check.ts` | one runnable check | new |

### Why `embeddingText()` moves

It currently lives in `scripts/pipeline/embed.ts`. That means the pipeline and
the route each own a copy of the single most important function in the matching
path, and they can drift apart silently. Drifted `embeddingText` does not throw,
does not warn, and does not fail a build — it just makes every similarity score
quietly meaningless. Moving it into `lib/embed.ts` and importing it from the
pipeline makes the drift unrepresentable.

---

## 3. `lib/embed.ts`

### Public surface

```ts
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

export function embeddingText(s: FailedStartup): string;
export async function embed(texts: string[]): Promise<number[][]>;
export async function embedOne(text: string): Promise<number[]>;
export function cosineSimilarity(a: number[], b: number[]): number;  // already done
```

### Implementation

```ts
import "server-only";
import path from "node:path";
import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";

// Weights ship in the repo. The default (allowRemoteModels = true) makes a cold
// lambda pull ~90MB from huggingface.co into /tmp on the judge's first query,
// over conference wifi. That is the single most likely way to lose the demo.
env.allowRemoteModels = false;
env.localModelPath = path.join(process.cwd(), "models");

// Loading the model is slow. Cache across invocations; never per request.
let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, { quantized: true });
  }
  return extractor;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const pipe = await getExtractor();
  const out = await pipe(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}
```

### `embeddingText` — the symmetry rule

```ts
export function embeddingText(s: FailedStartup): string {
  return [s.tagline, s.description.slice(0, 300), s.industry]
    .filter(Boolean)
    .join(". ");
}
```

The query side embeds the founder's raw text, trimmed, as typed. Nothing else.

Matching a one-line idea against a full multi-paragraph record is an asymmetry
that degrades results more than the model choice does. The corpus side is
deliberately truncated to roughly the length and shape of a pitch. `sources`,
`waybackUrl`, `proximateCause`, `rootCause` and `lesson` are **excluded** — a
founder describes what a company *does*, not how it died, so including the
failure analysis pulls matches toward companies that died the same way rather
than companies that tried the same thing.

**This function is a tuning knob, not a constant.** If matches are visibly bad
on the planted ideas, change this before changing anything else — and re-run
`pnpm pipeline:embed` afterwards, because both sides must move together.

### Model files

```
models/Xenova/all-MiniLM-L6-v2/
  config.json
  tokenizer.json
  tokenizer_config.json
  onnx/model_quantized.onnx        ~23MB, committed
```

Fetch once with a throwaway script that leaves `allowRemoteModels = true`, then
commit the cache directory into `models/` and flip the flag off.

### `next.config.ts` — two keys

`serverExternalPackages: ["@xenova/transformers", "onnxruntime-node"]` is already
there and is correct. Add:

```ts
outputFileTracingIncludes: {
  "/api/search": ["./models/**/*"],
},
```

Without it, Next's tracer ships the code and drops the weights: works locally,
404s the model in production. Same failure class `lib/data.ts` already documents
for the JSON.

### Version pin — do not touch

`@xenova/transformers@2.17.2` is pinned in `package.json` and that pin is
load-bearing. In `2.x`, `onnxruntime-node` is an **optional** dependency; in
`@huggingface/transformers@3.x` it became a hard dependency and the traced
function size blows Vercel's 250MB limit. See
<https://github.com/huggingface/transformers.js/issues/1164>. Upgrading this
package is a deploy-breaking change, not a routine bump.

---

## 4. `lib/search.ts`

Two exported rankers. The route picks; the module does not know about failure.

```ts
export function rankByVector(
  queryVector: number[],
  records: FailedStartup[],
  vectors: Record<string, number[]>,
  limit: number,
): StartupMatch[];

export function rankByBM25(
  query: string,
  records: FailedStartup[],
  limit: number,
): StartupMatch[];
```

- `rankByVector` — cosine per record, `similarity` clamped to `[0,1]` with
  `Math.max(0, ...)` because the contract promises that range and a normalized
  cosine can land marginally negative. A record with no vector scores 0 rather
  than throwing; a half-embedded corpus should degrade, not 500.
- `rankByBM25` — replaces the Jaccard placeholder. `k1 = 1.5`, `b = 0.75`, IDF
  computed over the loaded corpus, same stopword list, haystack widened to
  include `rootCause` and `lesson` (the fallback has no semantics, so it needs
  every literal token it can get). Roughly 30 lines.

Both sort descending and slice to `limit`. Neither throws on an empty corpus.

> `// ponytail: BM25 over ~55 docs, IDF recomputed per call. Cache the IDF table`
> `// if the corpus ever passes a few thousand records.`

---

## 5. `lib/data.ts`

Three changes:

1. `import "server-only"` at the top. Every current importer is a server
   component, so this breaks nothing today and prevents someone shipping the
   corpus to the browser later.
2. `loadVectors(): Record<string, number[]>` — statically imports
   `data/startups.vectors.json`, same reasoning as the existing static imports.
3. No change to `loadStartups()` / `isUsingMockData()`.

### Vectors live in their own file

`data/startups.vectors.json`, shape `{ "<id>": number[384] }`, starts as `{}`.

The scaffold speced vectors written back **into** `startups.enriched.json`. They
go in a separate file instead, for three reasons:

- ~55 × 384 floats is roughly 420KB of JSON. Keeping it out of the enriched file
  leaves that file readable and diffable, which is what Davin's QA pass needs.
- It deletes the "strip `embedding` before responding" step entirely. You cannot
  leak a field you never joined.
- A stray `import enriched from ...` in a client component costs 4KB, not 420KB.

`scripts/pipeline/embed.ts` therefore reads `startups.enriched.json`, writes
`startups.vectors.json`, and never mutates its input. Re-runnable, and a crash
cannot corrupt Asher's work. Its `EmbeddedStartup` type is deleted — nothing
joins a vector onto a record any more — and `lib/types.ts` gains
`StartupVectors = Record<string, number[]>` in its place.
**This is contract change #6 — announce it.**

---

## 6. `POST /api/search`

`runtime = "nodejs"` · `maxDuration = 30`

### Request

```jsonc
{ "query": "an app for same-day grocery delivery in the suburbs", "limit": 5 }
```

| Field | Rule | On violation |
|---|---|---|
| `query` | string, trimmed, 1–500 chars | `400 { error }` |
| `limit` | number, default 5, clamped 1–20 | non-number silently becomes 5 |

The 500-char cap is the trust boundary. It bounds the embedding cost and stops a
paste-bomb from reaching `/api/report` later in the flow.

### Response

`SearchResponse`. `matches` sorted by `similarity` descending. **`report` is
always `""`** — see §9.1.

### Headers

| Header | When |
|---|---|
| `x-graveyard-mock-data: true` | serving `startups.mock.json` |
| `x-graveyard-degraded: true` | `embed()` threw; these are BM25 scores |
| `x-graveyard-degraded-reason` | short string, e.g. `embed-timeout` |
| `x-graveyard-stub` | **removed** the moment `rankByVector` ships |

`x-graveyard-degraded` exists so a keyword result can never be presented as a
semantic one. Sam renders a badge for it. It is the same safety rail as the
stub header, for the failure mode that replaces stubbing.

### Flow

```ts
const records = loadStartups();
let matches: StartupMatch[];
let degraded: string | null = null;

try {
  const qv = await embedOne(query);
  matches = rankByVector(qv, records, loadVectors(), limit);
} catch (err) {
  degraded = err instanceof Error ? err.name : "embed-failed";
  matches = rankByBM25(query, records, limit);
}
```

No retry. A cold start that exceeds 30s is not going to succeed on a second
attempt inside the same invocation, and BM25 answers in single-digit
milliseconds.

---

## 7. `POST /api/report`

`runtime = "nodejs"` · `maxDuration = 60` (Hobby's ceiling — no headroom, do not
raise it expecting more)

### Request

```jsonc
{ "query": "...", "matches": [ /* StartupMatch[] */ ] }
```

| Field | Rule | On violation |
|---|---|---|
| `query` | string, trimmed, 1–500 | `400` |
| `matches` | array, capped at 20, each needs `id` + `name` | `400` |

### Response — a stream, not JSON

`Content-Type: text/plain; charset=utf-8`, chunked Markdown. Darryl reads it with
`for await (const chunk of res.body)`.

Not SSE, not JSON-lines: the payload is one Markdown document and the client
appends chunks to a string. Any envelope is ceremony the demo does not need.

**Errors before the first byte** return `4xx/5xx { error }` as normal. Once
streaming starts the status is committed, so a mid-stream Anthropic failure ends
the stream early. The UI renders what it received and shows a "report cut short"
note — it must never blank the tombstones, which are already on screen from
`/api/search`.

### Planted reports

Checked **before** Claude:

```ts
const key = query.toLowerCase().replace(/\s+/g, " ").trim();
const planted = (plantedReports as Record<string, string>)[key];
if (planted) return streamString(planted);   // still text/plain, still chunked
```

`data/reports.planted.json`, shape `{ "<normalized query>": "<markdown>" }`,
starts as `{}`. Content is Davin's (his three planted ideas); the lookup is
Yeriel's. This is the plan's own fallback #3, pre-wired for about 15 lines, so
adopting it on stage is a data edit rather than a code change.

### The Claude call

```ts
const stream = client.messages.stream({
  model: REPORT_MODEL,                    // claude-opus-5
  max_tokens: 4096,
  thinking: { type: "adaptive" },
  output_config: { effort: "medium" },
  system: REPORT_SYSTEM,
  messages: [{ role: "user", content: buildUserMessage(query, matches) }],
});
```

- `max_tokens: 4096` — the report is 600–900 words. Streaming means no HTTP
  timeout risk, so this is a ceiling, not a target.
- `effort: "medium"` — balances depth against the pre-text pause. Thinking
  `display` defaults to omitted on Opus 5, so adaptive thinking shows up on stage
  as silence before the first token. If that gap is too long in rehearsal, drop
  to `effort: "low"`. If you would rather turn the gap into a feature, set
  `thinking: { type: "adaptive", display: "summarized" }` and stream the
  reasoning above the report.
- **No `cache_control`.** The system prompt is roughly 400 tokens and the
  minimum cacheable prefix is about 1024, so a breakpoint here would silently do
  nothing. (Caching would matter if the whole corpus were in the prompt. It is
  not — only the matches are.)

### Fields sent to Claude

`id, name, tagline, description, industry, foundedYear, diedYear, fundingRaised,
proximateCause, rootCause, timingNote, lesson, similarity`.

Excluded: `sources` (URLs are pure token cost, the cards already display them,
and a model handed URLs will eventually emit a subtly wrong one), `waybackUrl`,
and anything vector-shaped.

### System prompt

```
You are a diligence analyst writing for a founder who has just described a
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
execution".
```

### No key, no lies

`hasClaudeKey()` false, or `getClaude()` throws → `500 { error }`. Never a
canned report dressed as a real one. The tombstones are already rendered; the
report area shows an error state. That is a degraded demo. A fabricated
diligence report presented as Claude's is a lost Idea score.

---

## 8. `POST /api/reconstruct`

`runtime = "nodejs"` · `maxDuration = 15`

### Request

| Field | Rule | On violation |
|---|---|---|
| `url` | string, trimmed, 1–200 chars, matching `^[a-z0-9.\-/:_%?=&]+$` case-insensitively | `400` |
| `year` | integer 1990–current | ignored if invalid, never a 400 |

The charset check is the trust boundary: this route takes user input and makes an
outbound request. The host is hardcoded to `archive.org` and the input only ever
lands in a query parameter, so the blast radius is small — but validate anyway.

### Response

```jsonc
{
  "url": "webvan.com",
  "snapshotUrl": "https://web.archive.org/web/20160421075323if_/http://webvan.com/",
  "timestamp": "20160421075323",
  "available": true,
  "source": "baked"
}
```

`source: "baked" | "live" | "none"` is an additive field (contract change #5).
It lets the UI distinguish "we shipped this snapshot" from "we just resolved it
live", which matters when debugging on stage.

### Resolution order

1. **Baked.** `getStartupById(...)` / match on the domain; if `waybackUrl` is
   non-empty, return it. Zero network. This is the demo path.
   `waybackUrl` is filled by `pnpm pipeline:wayback`
   (`scripts/pipeline/wayback.ts`, Yeriel) — the last pipeline step, idempotent,
   touching only that field. `enrich.ts` leaves it `""`; without the wayback
   step this branch never fires and every request goes live.
2. **Live.** `https://archive.org/wayback/available?url=<url>&timestamp=<year>`,
   `AbortSignal.timeout(3000)`, one retry on network error or 429/5xx, then give
   up. Response shape:
   `{ archived_snapshots: { closest: { available, url, timestamp, status } } }`;
   `archived_snapshots` is `{}` when nothing is archived.
3. **Nothing.** `{ available: false, snapshotUrl: null, source: "none" }`, HTTP
   200. Not an error — most dead startups have no usable snapshot. This route
   must never throw and must never break the results page.

### The `if_` transform

The API returns `http://web.archive.org/web/20160421075323/http://webvan.com/`.
Before it goes to the UI:

```ts
export function toEmbeddableSnapshot(raw: string): string {
  return raw
    .replace(/^http:\/\/web\.archive\.org/, "https://web.archive.org")
    .replace(/(\/web\/\d{14})\//, "$1if_/");
}
```

`if_` strips the Wayback toolbar and yields the closest thing to the original
page. Also run it over baked `waybackUrl` values, so the pipeline can store the
plain form and one function owns the shape.

**`available: true` does not mean it renders.** Plenty of archived pages carry
headers that refuse framing, and that is invisible until you try. The UI needs an
`onError` path on the iframe and a screenshot fallback for the planted heroes.
Flagging it here because it is a UI failure caused by a backend response that
looks entirely successful.

---

## 9. Contract changes — announce before merging

Per CLAUDE.md rule 5. All six, in one message to the team.

1. **`SearchResponse.report` is always `""` from `/api/search`.** The type is
   unchanged and still valid; the semantics moved. Reports come from
   `/api/report`. Resolves the open question in `app/api/README.md`.
2. **`/api/report` returns a `text/plain` stream, not `ReportResponse` JSON.**
   A real change to a non-frozen type. Darryl's fetch changes.
3. **New `x-graveyard-degraded` header** (+ optional `-reason`). Sam needs a
   badge for it, same treatment as the stub badge.
4. **`next.config.ts` gains `outputFileTracingIncludes`** — shared root file.
5. **`ReconstructResponse` gains `source`.** Additive, non-breaking.
6. **Vectors go to `data/startups.vectors.json`, not into the enriched file.**
   Touches Asher's pipeline output and `data/README.md`.

Also worth saying out loud, though it changes no code: **`models/` adds ~23MB to
the repo.** Everyone's next clone is slower, and it is not revertable in a way
that shrinks history.

---

## 10. Verification — `scripts/check.ts`

One file, `assert`-based, no framework. `pnpm check` → `tsx scripts/check.ts`.

| # | Check | Catches |
|---|---|---|
| 1 | `cosineSimilarity(v, v) === 1`; orthogonal `=== 0`; length mismatch throws | maths |
| 2 | `embed(["x"])` returns one 384-length vector | wrong model / wrong pooling |
| 3 | `embed(["x"])` twice returns identical values | non-determinism, stale cache |
| 4 | a known mock query ranks its intended record #1 **through the full vector path** | `embeddingText` drift |
| 5 | `rankByBM25` returns descending, and `[]` on an empty corpus without throwing | fallback that fails when it is needed |
| 6 | `toEmbeddableSnapshot` emits the `if_` form and https | silent iframe breakage |

Check 4 is the one that earns the file. Every other failure here is loud; a
drifted `embeddingText` presents as "the matches are mysteriously bad", at hour
30, with no stack trace.

Check 4 runs against `startups.mock.json` so it works before Asher's data lands
and needs no API key.

---

## 11. Failure matrix

| Fails | `/api/search` | `/api/report` | `/api/reconstruct` | Demo |
|---|---|---|---|---|
| `embed()` throws | BM25 + degraded badge | fine | fine | survives, visibly flagged |
| `ANTHROPIC_API_KEY` missing | fine | `500`, error state | fine | tombstones only |
| Anthropic mid-stream error | fine | truncated report | fine | partial report, cards intact |
| archive.org 429 / down | fine | fine | `available: false` | no reveal, nothing breaks |
| `startups.vectors.json` empty | every score 0 → BM25 quality | fine | fine | ugly but alive |
| `startups.enriched.json` empty | mock data + amber banner | fine | fine | must not reach a judge |

Nothing in the first column takes down more than its own column. That is the
whole reason the report is a separate call.

---

## 12. The hour-2 spike

**Twenty minutes, before any other backend work.**

1. Branch `feat/api-embed-spike`.
2. Implement `embed()` for real per §3, weights committed, flag off.
3. Add a throwaway `app/api/embed-smoke/route.ts` that embeds one string and
   returns its length.
4. Push. Watch the Vercel build.

**Deploys and returns 384** → MiniLM is settled. Delete the smoke route,
continue.

**"Serverless Function has exceeded the unzipped maximum size of 250 MB"** →
switch to the fallback below, having burned twenty minutes instead of twenty
hours. Tell Darryl the same hour.

### Fallback: Supabase Edge Function

Only if the spike fails.

- One Edge Function running `Supabase.ai.Session('gte-small')`. ONNX runs
  natively in their Deno runtime, so nothing lands in the Vercel bundle.
- `lib/embed.ts` becomes a `fetch` to that function. **Everything else in this
  spec is unchanged** — that is what the wrapper is for.
- `gte-small` is also 384 dimensions but a **different vector space**. Every
  corpus vector must be regenerated through the same function. Never mix.
- Consequence to state plainly: Asher can no longer run `pnpm pipeline:embed`
  offline. His step now depends on a deployed function.
- The plan lists Supabase as cut #1 and CLAUDE.md rule 1 requires asking before
  adding it. Using it as a stateless embedding endpoint is not "adding a
  database", but Darryl still decides.

---

## 13. If this moves to Cloudflare later

Not a port of this spec — a rewrite of one file, plus a data regeneration.

Workers are V8 isolates. `onnxruntime-node` works by `dlopen`-ing a native
`.so`; Workers have no `dlopen`, no filesystem, no native addons. The WASM route
does not survive the limits either: Worker size caps at 3MB free / 10MB paid
against a ~23MB model, inside 128MB of memory and a 1-second startup budget.

The Cloudflare answer is a binding —
`env.AI.run('@cf/baai/bge-base-en-v1.5', { text })` — which means a different
model, a different vector space, and `pnpm pipeline:embed` re-run against the new
backend to rewrite every vector. Roughly an hour of mechanical work, but it is
not the one-line swap `lib/embed.ts` appears to promise. Budget for it honestly.

`/api/report` and `/api/reconstruct` port unchanged; both are `fetch` calls.

Separately: this repo is Next.js, and Next.js on Cloudflare means the OpenNext
adapter, not a native deploy. Worth the team knowing now rather than in week
three.

---

## Appendix — limits at a glance

| | search | report | reconstruct |
|---|---|---|---|
| `runtime` | nodejs | nodejs | nodejs |
| `maxDuration` | 30 | 60 | 15 |
| target latency | <300ms warm | first token <3s | <50ms baked |
| needs `ANTHROPIC_API_KEY` | no | **yes** | no |
| external calls | none | api.anthropic.com | archive.org (fallback only) |

### Region — `vercel.json`

```json
{ "regions": ["syd1"] }
```

Functions default to `iad1` (Washington DC). We demo in Sydney, so the default
costs roughly 200ms of Pacific round trip on every API call, for nothing. Hobby
allows exactly one region, and `syd1` is it.

Measured locally, the embedding itself is not the bottleneck — 262ms cold
(model load plus first inference), **5ms warm**, 90ms to embed all 55 corpus
records. At 5ms of compute, a 200ms network penalty is 40x the actual work.

Cold start remains ~500ms on a Lambda that has gone idle, which it will have
between rehearsal and the pitch. If the judge's first query feels slow, warm the
function with a ping when the landing page loads rather than trying to make the
model load faster.

### Limits

Vercel Hobby: 60s function ceiling, 250MB unzipped bundle. Neither is raisable
without upgrading the plan.

Environment: `ANTHROPIC_API_KEY` only. No embeddings key — that is the point of
running MiniLM locally.
