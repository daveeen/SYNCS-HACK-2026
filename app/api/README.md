# API contract

Owner: **Yeriel**. Tie-breaker on changes: **Darryl**.

Three route handlers, all `POST`, all `runtime = "nodejs"`, all JSON in / JSON
out. **This document is the contract.** The frontend is built against it before
the implementations exist, so changing a request or response shape breaks other
people's work — announce it in team chat first (CLAUDE.md rule 5).

Types live in [`lib/types.ts`](../../lib/types.ts). Import them; don't retype them.

## Stub headers

Every endpoint is currently a stub. While that is true the response carries:

| Header | Meaning |
|---|---|
| `x-graveyard-stub: true` | This response was faked. Do not demo it. |
| `x-graveyard-mock-data: true` | The startups are the 10 invented companies in `data/startups.mock.json`, not real ones. |

The headers disappear as each piece goes real. **The UI should surface a visible
badge while `x-graveyard-stub` is present** — it is the thing that stops us
demoing fake output to a judge by accident.

## Errors

Any failure returns `{ "error": "human readable reason" }` with a 4xx/5xx status.
`400` = bad input, `500` = our fault.

---

## `POST /api/search`

The core endpoint: idea in, matched graveyard + report out.

**Request** — `SearchRequest`

```json
{ "query": "an app for same-day grocery delivery in the suburbs", "limit": 5 }
```

- `query` (string, required) — the founder's pasted idea. Trimmed; empty → 400.
- `limit` (number, optional) — how many matches. Default `5`, clamped to 1–20.

**Response** — `SearchResponse`

```json
{
  "query": "an app for same-day grocery delivery in the suburbs",
  "matches": [
    { "id": "mock-001", "name": "Fetchly", "similarity": 0.62, "...": "every FailedStartup field" }
  ],
  "report": "## What the graveyard says...  (Markdown)"
}
```

- `matches` — `FailedStartup & { similarity: number }`, similarity in `[0,1]`,
  sorted highest first.
- `report` — **Markdown**. Render it as Markdown, not plain text.

**Now:** keyword-ranked matches (`lib/search.ts`) + a canned report.
**Later:** `embed(query)` + cosine over precomputed vectors, and the report
either inlined here or fetched separately from `/api/report`.

> **Open question for the team:** should `/api/search` return the report inline
> (one round trip, slower first paint) or should the UI call `/api/report`
> separately (tombstones appear instantly, report streams in after)? The
> contract currently allows both. Darryl to decide by Phase 1 — the second is
> almost certainly the better demo.

---

## `POST /api/report`

Claude's diligence write-up for one idea, given the matches.

**Request** — `ReportRequest`

```json
{ "query": "an app for same-day grocery delivery in the suburbs", "matches": [ /* StartupMatch[] */ ] }
```

**Response** — `ReportResponse`

```json
{ "query": "...", "report": "## The idea ... (Markdown)" }
```

`maxDuration = 60` — Claude Opus on a long prompt is not fast.

**Now:** canned Markdown listing the match names.
**Later:** Claude, called server-side only.

---

## `POST /api/reconstruct`

Pull the dead company's old homepage out of the Internet Archive. The demo's
"wow" moment.

**Request** — `ReconstructRequest`

```json
{ "url": "webvan.com", "year": 2016 }
```

- `url` (string, required) — domain or full URL of the dead startup.
- `year` (number, optional) — preferred snapshot year.

**Response** — `ReconstructResponse`

```json
{ "url": "webvan.com", "snapshotUrl": "https://web.archive.org/web/2016.../http://webvan.com", "timestamp": "20160421075323", "available": true }
```

`available: false` with `snapshotUrl: null` is a normal, expected answer — most
dead startups have no usable snapshot. **The UI must handle it gracefully**;
this endpoint failing must never break the results page.

**Now:** always returns `available: false`.
**Later:** `https://archive.org/wayback/available?url=…&timestamp=…`.

> Two known traps, flagged early: many archived pages send `X-Frame-Options` and
> refuse to render in an `<iframe>`, and the Availability API is flaky under
> load. Plan a cached screenshot fallback for the planted demo ideas — do not
> bet the live demo on a third-party API responding on stage.
