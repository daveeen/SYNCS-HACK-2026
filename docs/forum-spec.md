# Forum spec — accounts, posts, comments, likes, tombstone mentions

Owner: **Yeriel**. Tie-breaker on contract changes: **Darryl**.
Scope: Supabase project setup, schema + RLS, auth flow, `app/api/forum/*`,
`lib/forum/*`, and the check-script additions.

Not in scope: forum UI (Sam and Darryl), moderation policy, the existing three
Graveyard routes.

Depends on [backend-spec.md](backend-spec.md) — the auto-match feature reuses
`embedOne()` and `rankByVector()` unchanged.

---

## 0. Decisions, and what they cost

| Decision | Chosen | Rejected because |
|---|---|---|
| Platform | **Next.js on Vercel, unchanged** | Next 16 on Cloudflare is upstream-broken: OpenNext does not support `proxy.ts`, and `next-on-pages` is deprecated |
| Database | **Supabase Postgres** | Vercel has no database of its own since the Dec 2024 sunset; a provider was required either way |
| Auth | **Supabase Auth, email confirmation off** | Hand-rolling means owning CSRF, session rotation and timing-safe comparison — none of which a judge sees and all of which are easy to get subtly wrong |
| Write path | **Route handlers, using the caller's token** | Direct browser writes cannot run `embedOne()`, which is Node-only |
| Ownership enforcement | **RLS** | An `if` in a route handler is a check someone can forget; a policy is one the database refuses |
| Like counts | **`count(*)`, no counter column** | Counter columns need triggers to stay honest, and that is more code than the query it saves |

**This adds Supabase, which GRAVEYARD_TEAM_PLAN.md lists as cut #1 and CLAUDE.md
rule 1 requires asking about.** Darryl approves before any of this merges.

---

## 1. Architecture

```
READS   browser ──► Supabase directly (anon key + RLS, Realtime on comments)

WRITES  browser ──► POST /api/forum/* ──► verify session
                                      ├─► rate-limit check
                                      ├─► parse @mentions against the corpus
                                      ├─► embedOne + rankByVector  (posts only)
                                      └─► insert via the CALLER'S token, RLS live
                                          then mentions + post_matches via service role
```

Reads are high-volume, cacheable and benefit from Realtime. Writes are rare,
need server-only compute, and are the entire attack surface. Splitting them puts
each on the path that suits it.

---

## 2. Supabase project setup

### Auth configuration

Dashboard → Authentication → Providers → Email:

- **Confirm email: OFF**
- Minimum password length: 8

Two consequences, stated here so they are decisions rather than discoveries:

- **No account recovery.** Password reset emails go to an address nobody proved
  ownership of, so a forgotten password is a dead account.
- **Nothing stops `a@a.a`.** Email is a login identifier here, not a contact
  channel or a proof of anything.

Both are acceptable for a demo. Neither is acceptable if this outlives the
hackathon — turning confirmation on later is a config change, not a migration.

### Environment

`.env.example` already carries these three, commented out. Uncomment them.

| Variable | Where it may appear |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser and server — public by design, RLS is what protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only.** Bypasses RLS entirely. Never `NEXT_PUBLIC_`, never imported outside `app/api/*` |

The anon key being public is not a violation of CLAUDE.md rule 4. It is designed
to be shipped to browsers, and it is useless without RLS policies to grant it
anything. The service role key is the one that matters, and it is treated
exactly like `ANTHROPIC_API_KEY`.

### The grants trap

**Supabase projects created after 30 May 2026 require explicit Postgres grants
before PostgREST can see a table.** This project is created after that date. Skip
the grants and every query returns an empty result or a permission error that
reads like an RLS bug — you will spend an hour rewriting correct policies.

The grants are in §3 and are not optional.

---

## 3. Schema

Run once in the Supabase SQL editor. Idempotent, so a re-run is safe.

```sql
create extension if not exists citext;

-- ---------------------------------------------------------------- profiles
-- The account system. auth.users holds credentials; this holds identity.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     citext unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

-- A profile row is created by trigger on signup, reading the handle the client
-- passed through auth options.data. security definer + empty search_path is the
-- documented safe form; without it this function is a privilege-escalation path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, new.raw_user_meta_data->>'handle');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------- posts
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null check (char_length(title) between 3 and 200),
  body       text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx  on public.posts (author_id);

-- ---------------------------------------------------------------- comments
-- parent_id gives one level of nesting. Deeper threading is not worth the
-- recursive query or the UI it would need.
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  parent_id  uuid references public.comments(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

-- ------------------------------------------------------------------- likes
-- The composite primary key IS the one-like-per-person rule. Enforced by the
-- database, so two concurrent requests cannot both win.
create table if not exists public.likes (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index if not exists likes_target_idx on public.likes (target_type, target_id);

-- ---------------------------------------------------------------- mentions
-- @webvan in a body resolves to a corpus record. A table rather than
-- render-time parsing, so a dead startup's page can list every post about it.
create table if not exists public.mentions (
  source_type text not null check (source_type in ('post', 'comment')),
  source_id   uuid not null,
  startup_id  text not null,
  created_at  timestamptz not null default now(),
  primary key (source_type, source_id, startup_id)
);
create index if not exists mentions_startup_idx on public.mentions (startup_id);

-- ------------------------------------------------------------ post_matches
-- What the graveyard says about this post. Derived, never user-written.
create table if not exists public.post_matches (
  post_id    uuid not null references public.posts(id) on delete cascade,
  startup_id text not null,
  similarity real not null check (similarity between 0 and 1),
  primary key (post_id, startup_id)
);
```

`startup_id` is a plain `text` with no foreign key. The corpus lives in a
committed JSON file, not in Postgres, so there is nothing to reference. A
mention of an id that later disappears renders as plain text rather than
breaking — which is the correct behaviour anyway.

### Row Level Security

```sql
alter table public.profiles     enable row level security;
alter table public.posts        enable row level security;
alter table public.comments     enable row level security;
alter table public.likes        enable row level security;
alter table public.mentions     enable row level security;
alter table public.post_matches enable row level security;

-- Everything is world-readable. It is a public forum.
create policy "read profiles"     on public.profiles     for select using (true);
create policy "read posts"        on public.posts        for select using (true);
create policy "read comments"     on public.comments     for select using (true);
create policy "read likes"        on public.likes        for select using (true);
create policy "read mentions"     on public.mentions     for select using (true);
create policy "read post_matches" on public.post_matches for select using (true);

-- Writes: only as yourself, only your own rows.
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);
-- No insert policy: profile rows are created by the security-definer trigger
-- above, which bypasses RLS. Nothing else may insert one.

create policy "insert own post" on public.posts
  for insert with check (auth.uid() = author_id);
create policy "modify own post" on public.posts
  for update using (auth.uid() = author_id);
create policy "delete own post" on public.posts
  for delete using (auth.uid() = author_id);

create policy "insert own comment" on public.comments
  for insert with check (auth.uid() = author_id);
create policy "modify own comment" on public.comments
  for update using (auth.uid() = author_id);
create policy "delete own comment" on public.comments
  for delete using (auth.uid() = author_id);

create policy "insert own like" on public.likes
  for insert with check (auth.uid() = user_id);
create policy "delete own like" on public.likes
  for delete using (auth.uid() = user_id);
```

`mentions` and `post_matches` get **no insert policy at all**. They are derived
rows written only by the service-role client inside a route handler, which
bypasses RLS. Absence of a policy is the enforcement.

### Grants — the PostgREST requirement

```sql
grant usage on schema public to anon, authenticated;

grant select on public.profiles, public.posts, public.comments,
                public.likes, public.mentions, public.post_matches
  to anon, authenticated;

grant insert, update, delete on public.posts, public.comments to authenticated;
grant insert, delete on public.likes to authenticated;
grant update on public.profiles to authenticated;
```

Grants say which roles may touch a table at all; RLS says which *rows*. Both are
required. A correct policy on an ungranted table returns nothing.

---

## 4. Auth flow

Signup takes handle, email and password. The handle rides through
`options.data` so the trigger in §3 can put it on the profile row:

```ts
await supabase.auth.signUp({
  email,
  password,
  options: { data: { handle } },
});
```

Handle uniqueness is a `citext unique` constraint, so a collision surfaces as a
Postgres `23505` on the trigger's insert. Map it to a 409 with a readable
message rather than leaking the constraint name.

Handles are **lowercase only**, and the route rejects uppercase rather than
silently lowercasing it. Quietly transforming input means the user sees a
different handle from the one they typed, which reads as a bug. `citext` still
makes lookups case-insensitive, so nobody can register `Webvan` alongside
`webvan`.

**Handle validation happens twice on purpose** — a regex in the route handler
for a good error message, and a `check` constraint in the schema because the
route handler is not the only thing that can ever insert.

Login and logout are Supabase Auth's own calls. Sessions are cookies managed by
`@supabase/ssr`; nothing custom.

---

## 5. Route contracts

All `POST`, all `runtime = "nodejs"`, all JSON in / JSON out. Errors match the
existing convention: `{ "error": "human readable reason" }` with 4xx/5xx.

Every route resolves the session from cookies first. **`author_id` comes from
the verified session and is never read from the request body** — accepting it
from the client is how this class of endpoint gets impersonation bugs.

### `POST /api/forum/posts`

`maxDuration = 30` — it embeds.

```jsonc
{ "title": "Anyone tried grocery delivery in low-density areas?", "body": "..." }
```

| Field | Rule |
|---|---|
| `title` | trimmed, 3–200 chars |
| `body` | trimmed, 1–10000 chars |

Order of operations, and it matters:

1. Resolve session → 401 if absent
2. Validate input → 400
3. Rate-limit check → 429
4. Insert the post **using the caller's token**, so RLS is live
5. Parse `@mentions`, insert via service role
6. `embedOne(title + body)` → `rankByVector` → insert `post_matches` via service role

Steps 5 and 6 happen after the post exists and are allowed to fail without
failing the request. A post with no tombstones is a worse post; a 500 on a post
that was already written is a bug that duplicates content when the user retries.
**Log the failure, return the post.**

Response: the created post, plus its matches and mentions.

### `POST /api/forum/comments`

`maxDuration = 15` — no embedding.

```jsonc
{ "postId": "uuid", "parentId": "uuid | null", "body": "..." }
```

Same order minus the match step. `parentId`, if present, must belong to the same
`postId` — a check the schema cannot express and the route must.

### `POST /api/forum/like`

`maxDuration = 10`.

```jsonc
{ "targetType": "post" | "comment", "targetId": "uuid" }
```

Toggle: delete if the row exists, insert if not. Both go through the caller's
token so RLS enforces `auth.uid() = user_id`. Returns `{ liked: boolean, count: number }`.

`count` is a `select count(*) from likes where target_type = $1 and target_id = $2`
after the toggle, served by `likes_target_idx`. No counter column to drift.

Idempotent by construction — a double-click cannot create two likes, because the
composite primary key forbids it.

### Reads — no route handlers

The browser queries Supabase directly with the anon key. Posts list is cursor
paginated on `created_at desc`, which the `posts_created_idx` index serves.
Comments subscribe to Realtime on `post_id`, so a new comment appears without a
refresh.

---

## 6. Mentions

Syntax is `@handle-like-token` resolved against the corpus, not against users:
`@webvan`, `@kozmo`. One namespace, and it is the dead startups — user mentions
are not in scope.

```ts
// lib/forum/mentions.ts
export function parseMentions(text: string, startups: FailedStartup[]): string[];
```

Resolution normalises both sides with `s.toLowerCase().replace(/[^a-z0-9]/g, "")`,
so `@webvan` matches "Webvan" and `@orbitalpost` matches "Orbital Post".
Unresolvable mentions are simply not stored, and render as the literal text the
user typed.

Returns deduplicated startup ids. Pure function, no I/O — which is why it is the
one piece of this feature that gets a real assert.

---

## 7. Auto-match

On post creation:

```ts
const vector = await embedOne(`${title}. ${body}`.slice(0, 2000));
const matches = rankByVector(vector, loadStartups(), loadVectors(), 3)
  .filter((m) => m.similarity >= 0.3);
```

Three matches, similarity floor 0.3. Both numbers are tunable and both are
guesses until there is real data to look at. The floor exists so a post about
nothing in particular shows no tombstones rather than three irrelevant ones at
0.11 — a bad match is worse than no match, because it makes the whole feature
look broken.

The 2000-char slice bounds embedding cost on a long post. MiniLM truncates at
its own context limit anyway; this just makes the truncation explicit.

Reuses `embedOne` and `rankByVector` **unchanged**. If `embed()` throws, §5 step
6 fails soft and the post has no matches.

---

## 8. Rate limiting

In Postgres, checked before insert:

```sql
select count(*) from public.posts
 where author_id = $1 and created_at > now() - interval '10 minutes';
```

Reject at 5. Comments: 20 per 10 minutes.

```
// ponytail: count query per write. Correct because it hits the same database
// every lambda shares, so it cannot be bypassed by landing on a cold instance.
// Move it into a BEFORE INSERT trigger if application code ever stops being the
// only writer.
```

No Redis, no Upstash, no new service. The one place a naive in-memory limiter
would have been actively wrong: serverless instances do not share memory, so an
in-process counter resets every cold start and is bypassed by concurrency.

**This is the only abuse control.** There is no content moderation — see §11.

---

## 9. Contract changes to announce

Per CLAUDE.md rule 5, before merging. **Item 1 needs Darryl's approval, not just
his awareness.**

1. **Supabase is added to the project.** The team plan lists it as cut #1 and
   CLAUDE.md rule 1 requires asking. It is used as a database and auth provider
   only — hosting does not change, deploys are still Vercel.
2. **Three new env vars**, already present but commented in `.env.example`.
   `SUPABASE_SERVICE_ROLE_KEY` is server-only and treated like the Anthropic key.
3. **New routes** under `app/api/forum/*`. The existing three are untouched.
4. **Reads bypass the API layer.** The frontend talks to Supabase directly for
   forum reads. That is a real departure from "server logic = route handlers
   only" and Darryl should agree to it explicitly.
5. **`@supabase/supabase-js` and `@supabase/ssr`** added to dependencies.

---

## 10. Verification

Extends `scripts/check.ts`. Anything needing a live database is exercised by
hand, the same way the existing routes were.

| Check | Catches |
|---|---|
| `parseMentions("@webvan died", corpus)` returns `["<webvan id>"]` | the resolver |
| `parseMentions` normalises `@orbitalpost` → "Orbital Post" | punctuation and spacing in names |
| `parseMentions` drops unknown `@notacompany` | inventing links to records that do not exist |
| `parseMentions` deduplicates a doubled mention | duplicate-key errors on insert |
| handle regex accepts `yeriel_1`, rejects `ab`, `Yeriel`, `a-b` | validation drift between route and schema constraint |

By hand, against a live project:

- signup → profile row exists with the chosen handle
- duplicate handle → 409, not a 500
- post while logged out → 401
- post with `author_id` forged in the body → the forged value is ignored
- sixth post inside ten minutes → 429
- like twice → toggles off, never two rows
- a post about grocery delivery shows Fetchly beneath it

---

## 11. What this deliberately does not do

- **No content moderation.** A public write endpoint with self-serve accounts and
  no email verification is scriptable. Rate limiting slows that down; it does not
  stop it. If the forum is live during judging, someone should be watching it.
  The cheap upgrade is a Haiku call on submit — roughly a tenth of a cent per
  post, and the SDK is already wired.
- **No downvotes, no karma, no sorting by hot.** Likes and reverse-chronological.
- **No edit history, no soft delete.** Delete is a delete.
- **No notifications, no search over posts.** The graveyard matcher is the only
  retrieval in the feature.

Each is a deliberate omission, not an oversight. Adding any of them is a new
decision, not a completion of this one.

---

## 12. Failure matrix

| Fails | Effect |
|---|---|
| `embedOne()` throws | Post is created with no tombstones. Logged. |
| Supabase unreachable | Forum is down; `/api/search`, `/api/report`, `/api/reconstruct` unaffected |
| Anthropic down | Forum unaffected — it never calls Claude |
| Service-role insert of mentions fails | Post exists, mentions render as plain text |
| Free project paused after idle | Forum 500s until a dashboard visit resumes it. Irrelevant during the hackathon, fatal for a demo a month later |

The forum cannot take down the graveyard. That separation is the same reason
`/api/search` never calls Anthropic.

---

## 13. Build order

**Two plans, not one.**

1. **Accounts** — Supabase project, schema, RLS, grants, signup/login/logout,
   `profiles`. Demoable on its own: register, log in, see your handle.
2. **Forum** — posts, comments, likes, mentions, auto-match. Meaningless
   without plan 1, and every route in it depends on a resolved session.

Splitting them keeps the auth work — the part where a mistake is a security
hole rather than a bug — in its own reviewable diff, instead of buried inside a
feature branch that also touches six tables.
