# data/ — the cargo

Owner: **Asher**. QA: **Davin**.

This directory is the source of truth for the demo. There is no database.

| File | What it is | Committed? |
|---|---|---|
| `startups.mock.json` | 10 **invented** companies. Lets the frontend build with zero dependency on real data or Claude. | yes |
| `startups.raw.json` | Output of `ingest.ts`. Normalised seed rows, no Claude analysis yet. | yes (small) |
| `startups.enriched.json` | Output of `enrich.ts`, with `waybackUrl` filled in by `wayback.ts`. **The real source of truth.** Starts as `[]`. | yes |
| `startups.vectors.json` | Output of `embed.ts`. `{ "<id>": number[384] }`, one vector per record, keyed by id. Starts as `{}`. | yes |

The app reads whichever of the two it can (see [`lib/data.ts`](../lib/data.ts)):
`startups.enriched.json` if it has records, otherwise `startups.mock.json`.
A visible amber banner shows while mock data is in use, and it disappears by
itself the moment the enriched file has content. **Do not delete that banner.**

## The flow

```
seed CSV / scraped pages
      │
      ▼  pnpm pipeline:ingest      normalise, dedupe, drop uncitable rows
data/startups.raw.json
      │
      ▼  pnpm pipeline:enrich      Claude: proximate vs ROOT cause + category, timing, lesson
data/startups.enriched.json
      │
      ▼  pnpm pipeline:embed       local MiniLM: one 384-d vector per record
data/startups.vectors.json         (separate file — never written back into startups.enriched.json)
      │
      ▼  pnpm pipeline:wayback     resolve a Wayback snapshot per record
data/startups.enriched.json        (fills the `waybackUrl` field only)
```

`embed.ts` writes to its own file rather than back into `startups.enriched.json`
for two reasons: the enriched file has to stay readable for Davin's QA pass,
and a crash in the embed step must never be able to corrupt Asher's work —
`embed.ts` only ever reads its input.

`wayback.ts` is idempotent: it skips any record that already has a
`waybackUrl`, so a rerun is free and hand-filled hero URLs are never
overwritten.

Each step is re-runnable and writes to disk, so a crash in one step never
costs you the ones before it.

## Seed sources

| Source | What you get | Notes |
|---|---|---|
| **CB Insights — "483 startup failure post-mortems"** | The canonical list, each entry linking a real post-mortem article. | Kaggle mirror: `dagloxkankwanda/startup-failures`. The link column is the gold here — it's the citation. |
| **Failory Graveyard** — failory.com/graveyard | ~100 curated failures with short written causes. | Scrape politely, rate-limit, keep the page URL as the source. |
| **GetAutopsy** — autopsy.io | Founder-written post-mortems. | Small and patchy, but the founder's own account is the highest-quality cause data we can get. |
| **Wayback Availability API** — `https://archive.org/wayback/available?url=…` | The dead company's actual old homepage. | Feeds `waybackUrl` and `/api/reconstruct`. Bias the seed list toward companies that HAVE good snapshots — that's the demo's wow moment. |

## Data quality rules

These are not style preferences. A judge asking "is this real?" and getting an
invented answer costs us the Idea and Pitch marks outright.

1. **Every real record needs a real URL in `sources[]`.** Never empty. An entry
   we cannot cite is an entry we cannot defend, so drop it.
2. **Unverifiable field ⇒ the literal string `"unknown"`.** Never a plausible
   guess. This applies to Claude's output too — the enrichment prompt must
   permit "unknown" and the validator must accept it.
3. **`proximateCause` ≠ `rootCause`.** Nearly every dead startup "ran out of
   cash"; that's the symptom. If the two fields come back identical, the
   enrichment failed — retry or flag it, don't ship it.
4. **`rootCauseCategory` must come from `ROOT_CAUSE_CATEGORIES` in
   [`lib/types.ts`](../lib/types.ts).** `"unknown"` is a legal value when the
   sources don't support a category — the report skips those rather than
   guessing. A value outside the list is a failed enrichment, same as
   `rootCause === proximateCause`. This exists because `/api/report` groups
   matches to find a shared pattern, and you cannot group free text:
   `rootCause` stays free text because it reads better on a tombstone card,
   `rootCauseCategory` is what the grouping runs on.
5. **Spot-check before merging** (Davin). Failure narratives in the wild are
   unreliable and often self-serving. Sample ~10 entries against their sources.
6. **`waybackUrl` is `""` when there's no snapshot.** Never a fabricated URL.
   The UI already handles the empty case.

## Adding a record by hand

Perfectly legitimate — hand-curated entries for the planted demo ideas are
likely to be our best ones. Match the `FailedStartup` shape in
[`lib/types.ts`](../lib/types.ts) exactly, append to `startups.enriched.json`,
and rerun `pnpm pipeline:embed` so the new record gets a vector. Rerun
`pnpm pipeline:wayback` too, unless you're hand-filling `waybackUrl` yourself
— either way the record needs one before `/api/reconstruct` can find it.
