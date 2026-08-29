# Graveyard backend — what it is and how to run it

Owner: **Yeriel**. Everything server-side: the three Graveyard routes, the forum,
the data pipeline, and the checks.

If you only need to *call* these endpoints from the frontend, read
[forum-reads.md](forum-reads.md) instead — it has the queries and the payloads
without any of this.

---

## The one-minute version

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

**The Graveyard demo runs with no API keys and no database.** Search, report and
reconstruct all work on the ten invented companies in `data/startups.mock.json`.

Only two things need credentials, and neither is on the demo path:

| Needs | What breaks without it |
|---|---|
| `ANTHROPIC_API_KEY` | `pnpm pipeline:enrich` only. No route calls Claude. |
| Supabase keys | the forum only. The Graveyard routes never touch it. |

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | dev server on :3000 |
| `pnpm build` | production build — **run before merging** |
| `pnpm lint` | ESLint |
| `pnpm check` | **the test suite.** 28 asserts, no framework, no key, no database |
| `pnpm fetch-model` | one-off: download MiniLM weights into `models/` |
| `pnpm pipeline:ingest` | seed data → `startups.raw.json` (Asher) |
| `pnpm pipeline:enrich` | Claude adds root cause + category (Asher, needs key) |
| `pnpm pipeline:embed` | MiniLM vectors → `startups.vectors.json` |
| `pnpm pipeline:wayback` | fills `waybackUrl` from the Internet Archive |
| `pnpm pipeline` | all four, in order |

**Before any PR: `pnpm check && pnpm build && pnpm lint`, and click the demo
path.** A green build that broke the demo is still a broken merge.

---

## Architecture

```
                    ┌─ /api/search      MiniLM + cosine       no key, no network
   browser ─────────┼─ /api/report      pure function          no key, no network
                    ├─ /api/reconstruct archive.org            no key
                    │
                    ├─ /api/auth/*      ─┐
                    ├─ /api/forum/*     ─┤ writes, session required
                    │                    └──► Supabase (Postgres + Auth)
                    └─ forum READS ─────────► Supabase directly, under RLS
```

**Nothing calls an LLM at request time.** That is deliberate and it is what
makes the demo path immune to an outage, a rate limit, or a slow first token.

Every route is isolated: `/api/search` never touches the database, `/api/report`
never touches the network, and the forum cannot take down the Graveyard.

---

## The three Graveyard routes

### `POST /api/search` — the core

Idea in, ranked dead startups out.

```bash
curl -s -X POST localhost:3000/api/search -H 'content-type: application/json' \
  -d '{"query":"same-day grocery delivery in the suburbs","limit":5}'
```

Embeds the query with **local MiniLM** (weights committed in `models/`), then
cosine against precomputed vectors. Roughly 5ms warm, 262ms cold.

`report` is **always `""`** — reports come from `/api/report`.

**If the model fails to load it falls back to BM25** and sets
`x-graveyard-degraded: true`. Never demo a degraded response as a semantic one —
that header exists so the UI can say so.

| Header | Meaning |
|---|---|
| `x-graveyard-mock-data: true` | serving the ten invented companies |
| `x-graveyard-degraded: true` | these are keyword scores, not embeddings |

### `POST /api/report` — the diligence write-up

```bash
curl -s -N -X POST localhost:3000/api/report -H 'content-type: application/json' \
  -d '{"query":"grocery delivery","matches":[ /* StartupMatch[] from /api/search */ ]}'
```

Returns a `text/plain` stream of Markdown. **No LLM at request time** — it is a
pure function over the matched records ([`lib/report.ts`](../lib/report.ts)).

Claude still does the reasoning, in `pipeline:enrich`, once per startup, where
Davin QAs every field against its sources. Every sentence traces to a reviewed
field, which is why it cannot fabricate.

It degrades honestly, and each branch has an assert:

- two or more matches share a `rootCauseCategory` → names it and counts it
- all causes differ → **says so**, rather than inventing a pattern
- one match → calls it an anecdote
- no matches → says nothing matched
- any field reading `"unknown"` → omitted, never printed as fact

### `POST /api/reconstruct` — the Wayback reveal

```bash
curl -s -X POST localhost:3000/api/reconstruct -H 'content-type: application/json' \
  -d '{"url":"webvan.com","year":2000}'
```

Baked first (`waybackUrl` on the record, zero network), then live archive.org
with a 3s timeout and one retry, then `available: false` at HTTP 200 — which is
a normal answer, not an error.

Snapshot URLs come back in the `web/<timestamp>if_/` form, which strips the
Wayback toolbar. **`available: true` does not mean it renders** — many archived
pages refuse framing, so the UI needs an iframe `onError` path.

---

## The forum

Requires Supabase. See [forum-spec.md](forum-spec.md) for the design and
[forum-reads.md](forum-reads.md) for the read queries.

### Setup, in order

1. **Create a Supabase project.** Sydney region if offered, same reason
   `vercel.json` pins `syd1`.

2. **Authentication → Providers → Email → `Confirm email`: OFF.**
   Not optional. With it on, every signup tries to send mail, the free-tier
   quota is a handful per hour, and registration starts returning
   `over_email_send_rate_limit`. There is also no verified address to send a
   reset to, so **there is no password recovery** — a forgotten password is a
   dead account.

3. **SQL Editor → paste [`supabase/schema.sql`](../supabase/schema.sql) → Run.**
   Idempotent, so re-running is safe. It is the source of truth; do not edit the
   schema through the dashboard UI or the next person cannot tell what changed.

4. **Database → Replication → add `comments` to `supabase_realtime`.**
   Only needed for live comments. Without it the subscription connects and
   silently never fires, which looks exactly like a frontend bug.

5. **Keys into `.env.local`** from Project Settings → API. The new
   `sb_publishable_` / `sb_secret_` format is what this expects.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Endpoints

| | Body | Returns |
|---|---|---|
| `POST /api/auth/register` | `{handle, email, password}` | `{userId, handle}` 201 |
| `POST /api/auth/login` | `{email, password}` | `{userId}`, sets `sb-` cookies |
| `POST /api/auth/logout` | — | `{ok: true}` |
| `POST /api/forum/posts` | `{title, body}` | the post, 201 |
| `POST /api/forum/comments` | `{postId, parentId?, body}` | the comment, 201 |
| `POST /api/forum/like` | `{targetType, targetId}` | `{liked, count}` |

Handles are **lowercase**, 3–20 chars, letters/digits/underscore. Uppercase is
rejected rather than silently lowercased — quietly changing what someone typed
reads as a bug.

Rate limits: **5 posts and 20 comments per 10 minutes per account.** A 429 means
the user did nothing wrong; show it as its own state, not as a generic failure.

### Three rules the forum code will not bend on

1. **`author_id` comes from the verified session, never the request body.** Post
   a forged `author_id` and it is ignored. This is the single most common way
   this class of endpoint gets impersonation bugs.
2. **Writes use the caller's token, so RLS stays live.** The service-role client
   (`lib/supabase/admin.ts`) bypasses RLS entirely and touches only derived rows
   — `mentions` and `post_matches`, which no user may write.
3. **Everything after a successful insert fails soft.** The row already exists;
   a 500 there makes the user retry and duplicate their content. A post without
   tombstones beats two posts.

---

## The data pipeline

```
seed CSV ─► ingest ─► enrich ─► embed ─► wayback
                        │         │         │
                        │         │         └─ fills waybackUrl (idempotent,
                        │         │            skips records that have one)
                        │         └─ writes startups.vectors.json — never
                        │            modifies the enriched file
                        └─ Claude writes rootCause, rootCauseCategory,
                           timingNote, lesson. Needs ANTHROPIC_API_KEY.
```

`data/startups.enriched.json` is the source of truth. `startups.mock.json` is
the fallback while it is empty, and the amber banner says so.

**`rootCauseCategory` must come from `ROOT_CAUSE_CATEGORIES`** in
[`lib/types.ts`](../lib/types.ts). `/api/report` groups on it to find the shared
pattern, and you cannot group free text. `"unknown"` is legal; anything outside
the list is a failed enrichment.

---

## Testing

One file, [`scripts/check.ts`](../scripts/check.ts), 28 asserts, no framework.
`pnpm check` runs with **no API key and no database** — deliberately, so it
works on a plane and in a fresh clone.

Pure functions carry the assertions. Anything needing the database is verified
by hand with the curls in
[forum-plan-1-accounts.md](forum-plan-1-accounts.md) and
[forum-plan-2-forum.md](forum-plan-2-forum.md).

Three worth knowing about:

- **"a grocery idea ranks Fetchly first"** runs the *entire* vector path. It is
  the only thing that catches `embeddingText` drifting between the pipeline and
  the route — a failure that otherwise shows up as "the matches are mysteriously
  bad" at hour 30 with no stack trace. **If it fails, tune `embeddingText`; do
  not weaken the check.**
- **"an email address is not a mention"** — without a leading boundary on the
  `@`, every post containing an email would link to a dead startup.
- **"route regex is identical to the schema CHECK constraint"** parses
  `supabase/schema.sql` rather than comparing two hardcoded copies.

---

## Traps that have already bitten

**`import "server-only"` on anything a script imports.** That package throws
under plain Node, so any module reachable from `scripts/*` cannot have it. It
has caught us three times — `lib/embed.ts`, `lib/claude.ts` and
`lib/forum/ratelimit.ts`. It is a React Server Component guard, not a secret
guard; put it on modules only route handlers import.

**`sharp` in `ignoredBuiltDependencies`.** `@xenova/transformers` declares it a
*hard* dependency and imports it at module load, so with its native binary
unbuilt every import of transformers throws — on a fresh clone and on Vercel
alike. It is in `onlyBuiltDependencies` in `pnpm-workspace.yaml` and must stay
there.

**`allowRemoteModels` must stay `false`.** The default is `true`, which makes a
cold lambda pull ~90MB from huggingface.co on the judge's first query, over
conference wifi.

**Do not upgrade `@xenova/transformers` past 2.17.2.** In 3.x
`onnxruntime-node` became a hard dependency and the traced function blows
Vercel's 250MB limit.

**Supabase grants are separate from RLS.** Projects created after 30 May 2026
need explicit `grant` statements before PostgREST can see a table. Skip them and
every query returns empty in a way that looks exactly like an RLS bug.

---

## Deploy

Vercel, from the repo root. `vercel.json` pins functions to **`syd1`** — the
default is Washington DC, which costs ~200ms of Pacific round trip per call
while we demo in Sydney.

The `/api/search` function traces to about 70MB on Vercel against a 250MB limit.
Measure it from the trace file, never with `du` on `node_modules`:

```bash
pnpm build
node -e "const t=require('./.next/server/app/api/search/route.js.nft.json');console.log(t.files.length,'files')"
```

`app/api/embed-smoke` is a temporary deploy gate. Hit it once on the preview URL
— it should return `{"dims":384}` — then delete it and its
`outputFileTracingIncludes` entry.
