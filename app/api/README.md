# API contract

Owner: **Yeriel**. Tie-breaker on changes: **Darryl**.

Three route handlers, all `POST`, all `runtime = "nodejs"`. Two take JSON and
return JSON; `/api/report` takes JSON and returns a `text/plain` stream.

**This document is the contract.** The frontend is built against it before
the implementations exist, so changing a request or response shape breaks other
people's work — announce it in team chat first (CLAUDE.md rule 5).

Types live in [`lib/types.ts`](../../lib/types.ts). Import them; don't retype them.

## Response headers

`/api/search` sets:

| Header | Meaning |
|---|---|
| `x-graveyard-mock-data` | `"true"` or `"false"`, always present. `"true"` means the startups are the 10 invented companies in `data/startups.mock.json`, not real ones. |
| `x-graveyard-degraded` | Present and `"true"` only when `embed()` threw and the matches came from the BM25 keyword fallback instead of cosine similarity over real vectors. |
| `x-graveyard-degraded-reason` | The error name that triggered the fallback. Present only alongside `x-graveyard-degraded`. |

**The UI should surface a visible badge while `x-graveyard-degraded` is
present** — it is the thing that stops a keyword match being shown to a judge
as a semantic one.

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
  "report": ""
}
```

- `matches` — `FailedStartup & { similarity: number }`, similarity in `[0,1]`,
  sorted highest first.
- `report` — **always `""`**. This route never calls Claude. Fetch the report
  separately from `/api/report` once the tombstones are on screen.

`embed(query)` (local MiniLM) against the precomputed vectors in
`data/startups.vectors.json`, cosine-ranked. If `embed()` throws, matches fall
back to BM25 keyword ranking (`lib/search.ts`) and the response is marked
`x-graveyard-degraded` — see **Response headers** above.

**Decided:** the report is a separate call, not inlined. Tombstones paint
immediately; the report streams in after. This is why `report` above is always
`""` — it is not a placeholder, it is the contract.

---

## `POST /api/report`

Claude's diligence write-up for one idea, given the matches.

**Request** — `ReportRequest`

```json
{ "query": "an app for same-day grocery delivery in the suburbs", "matches": [ /* StartupMatch[] */ ] }
```

**Response** — a `text/plain; charset=utf-8` **stream**, not JSON. No envelope
— the body is one chunked Markdown document, nothing else. Consume it as:

```ts
const res = await fetch("/api/report", { method: "POST", body: /* ReportRequest */ });
if (!res.ok) {
  const { error } = await res.json(); // ApiError — this path is still JSON
  // handle error
} else {
  let report = "";
  for await (const chunk of res.body) {
    report += new TextDecoder().decode(chunk);
    // append to the UI as it arrives
  }
}
```

An error before the first byte is a normal `4xx`/`5xx` `ApiError` JSON body — a
missing `ANTHROPIC_API_KEY` is a `500`, never a canned report standing in for a
real one. A failure **mid-stream** cannot change the status; the stream just
ends early and the UI shows what it received.

`data/reports.planted.json` (keyed by the lowercased, whitespace-collapsed
query) is checked before Claude is called at all — a planted report wins and
is served through the same streaming interface. Swapping one in for the demo
is a data edit, not a code change.

`maxDuration = 60` — Claude on a long prompt is not fast. This is Hobby's
ceiling; raising it does nothing without a plan upgrade.

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
{ "url": "webvan.com", "snapshotUrl": "https://web.archive.org/web/20160421075323if_/http://webvan.com", "timestamp": "20160421075323", "available": true, "source": "baked" }
```

- `source` — `"baked"` (the record's own `waybackUrl`, zero network — the demo
  path), `"live"` (resolved from the Availability API this request), or
  `"none"` (nothing found; `available: false` at HTTP `200`).

`available: false` with `snapshotUrl: null` is a normal, expected answer — most
dead startups have no usable snapshot. **The UI must handle it gracefully**;
this endpoint failing must never break the results page.

Resolution order: the record's baked `waybackUrl` (zero network, the demo path),
then `https://archive.org/wayback/available?url=…&timestamp=…` live with a 3s
timeout and one retry, then `available: false`. `waybackUrl` is filled by
`pnpm pipeline:wayback`.

> Two known traps, flagged early: many archived pages send `X-Frame-Options` and
> refuse to render in an `<iframe>`, and the Availability API is flaky under
> load. Plan a cached screenshot fallback for the planted demo ideas — do not
> bet the live demo on a third-party API responding on stage.
