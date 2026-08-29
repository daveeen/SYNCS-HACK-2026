# Forum Implementation Plan (plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in users can post, comment, like, and mention dead startups with `@handle` — and every new post shows the graveyard's matching tombstones beneath it.

**Architecture:** Reads go from the browser straight to Supabase under RLS. Writes go through `app/api/forum/*`, because the auto-match needs `embedOne()`, which is Node-only. Writes insert through the *caller's* token so RLS enforces ownership; the service-role client is used only for derived rows the user never writes.

**Tech Stack:** Next.js 16 App Router on Vercel (`syd1`) · Supabase Postgres + Auth · reuses `embedOne` and `rankByVector` from the existing backend · assert-based `scripts/check.ts`.

**Spec:** [forum-spec.md](forum-spec.md). **Depends on [plan 1](forum-plan-1-accounts.md)** — every task here needs `getCaller()`.

---

## Testing approach

Same as everything else in this repo. Pure functions (`parseMentions`, the
rate-limit arithmetic) get asserts in `scripts/check.ts`. Anything touching the
database gets a `curl` with exact expected output, verified by hand.

`pnpm check` and `pnpm build` gate the PR.

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `supabase/schema.sql` | append forum tables, RLS, grants | modify |
| `lib/forum/mentions.ts` | `@name` → startup ids, pure | **create** |
| `lib/forum/ratelimit.ts` | per-user write throttle | **create** |
| `lib/forum/match.ts` | run the graveyard matcher over a post | **create** |
| `app/api/forum/posts/route.ts` | create a post | **create** |
| `app/api/forum/comments/route.ts` | create a comment | **create** |
| `app/api/forum/like/route.ts` | toggle a like | **create** |
| `lib/types.ts` | forum row types | modify |
| `scripts/check.ts` | mention + ratelimit asserts | modify |

`lib/forum/match.ts` exists so the posts route does not grow a second
responsibility. It is the seam where the graveyard matcher meets the forum, and
keeping it separate is what lets the route stay readable.

---

## Task 1: Schema — posts, comments, likes, mentions, matches

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Append the tables**

Add to the end of `supabase/schema.sql`, after the profiles grants:

```sql
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
-- parent_id gives ONE level of nesting. Deeper threading needs a recursive
-- query and a UI nobody has time to build.
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
-- database, so two concurrent requests cannot both win. No counter column:
-- count(*) at forum scale is free, and counters need triggers to stay honest.
create table if not exists public.likes (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index if not exists likes_target_idx on public.likes (target_type, target_id);

-- ---------------------------------------------------------------- mentions
-- @webvan resolves to a corpus record. A table rather than render-time parsing,
-- so a dead startup's page can list every post that mentions it.
--
-- startup_id has no foreign key on purpose: the corpus is a committed JSON
-- file, not a Postgres table, so there is nothing to reference.
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

-- ------------------------------------------------------------------- RLS
alter table public.posts        enable row level security;
alter table public.comments     enable row level security;
alter table public.likes        enable row level security;
alter table public.mentions     enable row level security;
alter table public.post_matches enable row level security;

drop policy if exists "read posts" on public.posts;
create policy "read posts" on public.posts for select using (true);
drop policy if exists "insert own post" on public.posts;
create policy "insert own post" on public.posts
  for insert with check (auth.uid() = author_id);
drop policy if exists "modify own post" on public.posts;
create policy "modify own post" on public.posts
  for update using (auth.uid() = author_id);
drop policy if exists "delete own post" on public.posts;
create policy "delete own post" on public.posts
  for delete using (auth.uid() = author_id);

drop policy if exists "read comments" on public.comments;
create policy "read comments" on public.comments for select using (true);
drop policy if exists "insert own comment" on public.comments;
create policy "insert own comment" on public.comments
  for insert with check (auth.uid() = author_id);
drop policy if exists "modify own comment" on public.comments;
create policy "modify own comment" on public.comments
  for update using (auth.uid() = author_id);
drop policy if exists "delete own comment" on public.comments;
create policy "delete own comment" on public.comments
  for delete using (auth.uid() = author_id);

drop policy if exists "read likes" on public.likes;
create policy "read likes" on public.likes for select using (true);
drop policy if exists "insert own like" on public.likes;
create policy "insert own like" on public.likes
  for insert with check (auth.uid() = user_id);
drop policy if exists "delete own like" on public.likes;
create policy "delete own like" on public.likes
  for delete using (auth.uid() = user_id);

drop policy if exists "read mentions" on public.mentions;
create policy "read mentions" on public.mentions for select using (true);
drop policy if exists "read post_matches" on public.post_matches;
create policy "read post_matches" on public.post_matches for select using (true);

-- mentions and post_matches get NO insert policy. They are derived rows written
-- only by the service-role client, which bypasses RLS. Absence is enforcement:
-- no user, however authenticated, can write one.

-- ---------------------------------------------------------------- grants
grant select on public.posts, public.comments, public.likes,
                public.mentions, public.post_matches
  to anon, authenticated;

grant insert, update, delete on public.posts, public.comments to authenticated;
grant insert, delete on public.likes to authenticated;

-- The service-role client bypasses RLS, but it still needs table grants, and
-- the post-May-2026 rule applies to it too. Without these the derived-row
-- inserts fail silently into the fail-soft catch, and posts quietly ship with
-- no tombstones and no mentions — which looks like a broken matcher.
grant insert, delete on public.mentions, public.post_matches to service_role;
```

- [ ] **Step 2: Apply and verify**

Supabase SQL Editor → paste the whole file → Run. It is idempotent, so
re-running the profiles half is a no-op.

```sql
select tablename, count(*) as policies
  from pg_policies where schemaname = 'public'
 group by tablename order by tablename;
```

Expected:

```
comments      4
likes         3
mentions      1
post_matches  1
posts         4
profiles      2
```

**If `mentions` or `post_matches` shows more than 1, an insert policy leaked in.
Drop it** — those tables must be unwritable by users.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(forum): posts, comments, likes, mentions and matches with RLS"
```

---

## Task 2: Mention parsing

**Files:**
- Create: `lib/forum/mentions.ts`
- Modify: `scripts/check.ts`

- [ ] **Step 1: Write the failing checks**

Add to the imports in `scripts/check.ts`:

```ts
import { parseMentions } from "../lib/forum/mentions";
```

And inside `main()`:

```ts
  await check("mentions: resolves @name against the corpus", async () => {
    const mock = await loadMock();
    assert.deepEqual(parseMentions("@fetchly died in 2018", mock), ["mock-001"]);
  });

  await check("mentions: normalises punctuation and spacing in names", async () => {
    const mock = await loadMock();
    // "Orbital Post" -> @orbitalpost
    assert.deepEqual(parseMentions("see @orbitalpost", mock), ["mock-009"]);
  });

  await check("mentions: drops an unknown handle instead of inventing a link", async () => {
    const mock = await loadMock();
    assert.deepEqual(parseMentions("@notacompany was great", mock), []);
  });

  await check("mentions: deduplicates a repeated mention", async () => {
    const mock = await loadMock();
    assert.deepEqual(parseMentions("@fetchly and again @fetchly", mock), ["mock-001"]);
  });

  await check("mentions: an email address is not a mention", async () => {
    const mock = await loadMock();
    assert.deepEqual(parseMentions("mail me at yeriel@fetchly.com", mock), []);
  });
```

The email check matters: `@fetchly` inside `yeriel@fetchly.com` would otherwise
resolve, and every post containing an email address would silently link to a
dead startup.

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm check
```

Expected: the 22 from plan 1 pass; the five mention checks FAIL on the missing
module.

- [ ] **Step 3: Implement**

Create `lib/forum/mentions.ts`:

```ts
/**
 * @mention resolution. Owner: Yeriel.
 *
 * Pure — no I/O, so it is checkable without a database or a key.
 *
 * One namespace, and it is the dead startups. User mentions are not a feature;
 * `@yeriel` resolves to nothing and renders as the literal text.
 */
import type { FailedStartup } from "@/lib/types";

/**
 * `@` preceded by start-of-string or whitespace, then word characters.
 *
 * The leading boundary is what stops `yeriel@fetchly.com` matching — without
 * it, every post containing an email address links to a dead startup.
 */
const MENTION = /(^|\s)@([a-z0-9_]{2,40})/gi;

/** Both sides collapse to letters and digits, so "Orbital Post" answers to @orbitalpost. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Startup ids mentioned in the text, deduplicated, in first-appearance order.
 * Unresolvable mentions are dropped — they render as the literal text the user
 * typed, which is the honest outcome.
 */
export function parseMentions(text: string, startups: FailedStartup[]): string[] {
  const byName = new Map<string, string>();
  for (const s of startups) byName.set(normalise(s.name), s.id);

  const found: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const id = byName.get(normalise(match[2]));
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}
```

- [ ] **Step 4: Run the checks**

```bash
pnpm check
```

Expected: all 27 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/forum/mentions.ts scripts/check.ts
git commit -m "feat(forum): @mention resolution against the corpus"
```

---

## Task 3: Rate limiting

**Files:**
- Create: `lib/forum/ratelimit.ts`
- Modify: `scripts/check.ts`

- [ ] **Step 1: Write the failing check**

Add to `scripts/check.ts` imports:

```ts
import { LIMITS, isOverLimit } from "../lib/forum/ratelimit";
```

And in `main()`:

```ts
  await check("ratelimit: allows under the cap, rejects at and above it", () => {
    assert.equal(isOverLimit(LIMITS.post.max - 1, "post"), false);
    assert.equal(isOverLimit(LIMITS.post.max, "post"), true);
    assert.equal(isOverLimit(LIMITS.post.max + 5, "post"), true);
    assert.equal(isOverLimit(0, "comment"), false);
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm check
```

Expected: FAIL on the missing module.

- [ ] **Step 3: Implement**

Create `lib/forum/ratelimit.ts`:

```ts
/**
 * Write throttling. Owner: Yeriel.
 *
 * Counted in Postgres, not in memory. An in-process counter would be actively
 * wrong here: serverless instances share no memory, so it resets on every cold
 * start and is bypassed outright by concurrency. The database is the one thing
 * every lambda shares.
 *
 * No `server-only` guard: isOverLimit is pure and scripts/check.ts asserts it
 * under plain Node, where that package throws. There is nothing secret here —
 * countRecentWrites takes the client as an argument rather than building one.
 *
 * This is the ONLY abuse control. There is no content moderation — see
 * forum-spec.md §11. Rate limiting slows a script down; it does not stop one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const LIMITS = {
  post: { max: 5, windowMinutes: 10 },
  comment: { max: 20, windowMinutes: 10 },
} as const;

export type WriteKind = keyof typeof LIMITS;

/** Pure, so the arithmetic is checkable without a database. */
export function isOverLimit(recentCount: number, kind: WriteKind): boolean {
  return recentCount >= LIMITS[kind].max;
}

/**
 * Count the caller's writes inside the window.
 *
 * ponytail: one count query per write. Correct because it hits the shared
 * database. Move it into a BEFORE INSERT trigger if application code ever stops
 * being the only writer.
 */
export async function countRecentWrites(
  supabase: SupabaseClient,
  kind: WriteKind,
  userId: string,
): Promise<number> {
  const table = kind === "post" ? "posts" : "comments";
  const since = new Date(Date.now() - LIMITS[kind].windowMinutes * 60_000).toISOString();

  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId)
    .gt("created_at", since);

  if (error) {
    // Fail CLOSED. A rate limiter that opens when its own query breaks is not a
    // rate limiter.
    throw new Error(`rate limit check failed: ${error.message}`);
  }
  return count ?? 0;
}
```

- [ ] **Step 4: Run the checks**

```bash
pnpm check
```

Expected: all 28 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/forum/ratelimit.ts scripts/check.ts
git commit -m "feat(forum): per-user write throttle, counted in Postgres"
```

---

## Task 4: The graveyard matcher seam

**Files:**
- Create: `lib/forum/match.ts`

- [ ] **Step 1: Write it**

```ts
/**
 * Where the forum meets the graveyard. Owner: Yeriel.
 *
 * Reuses embedOne() and rankByVector() unchanged. This is the feature that
 * makes the forum ours rather than generic: post an idea, and the companies
 * that already died doing it appear underneath it.
 */
import "server-only";
import { embedOne } from "@/lib/embed";
import { rankByVector } from "@/lib/search";
import { loadStartups, loadVectors } from "@/lib/data";

/** Top N matches above the floor. Both numbers are guesses until there is real data. */
const TOP_N = 3;

/**
 * A bad match is worse than no match — three irrelevant tombstones at 0.11 make
 * the whole feature look broken, while zero tombstones just looks like a post
 * about nothing in particular.
 */
const SIMILARITY_FLOOR = 0.3;

/** Bounds embedding cost on a long post. MiniLM truncates anyway; this is explicit. */
const MAX_CHARS = 2000;

export type PostMatch = { startup_id: string; similarity: number };

export async function matchPost(title: string, body: string): Promise<PostMatch[]> {
  const vector = await embedOne(`${title}. ${body}`.slice(0, MAX_CHARS));
  return rankByVector(vector, loadStartups(), loadVectors(), TOP_N)
    .filter((m) => m.similarity >= SIMILARITY_FLOOR)
    .map((m) => ({ startup_id: m.id, similarity: Number(m.similarity.toFixed(4)) }));
}
```

- [ ] **Step 2: Verify against the real corpus**

```bash
cat > scripts/.matchdemo.ts <<'EOF'
import { matchPost } from "../lib/forum/match";
async function main() {
  console.log(await matchPost(
    "Grocery delivery for the suburbs",
    "Thinking about same-day delivery to low-density postcodes. Is this dumb?",
  ));
}
main();
EOF
npx tsx scripts/.matchdemo.ts; rm -f scripts/.matchdemo.ts
```

Expected: `[]` while `data/startups.vectors.json` is still `{}` — that is
correct and is the honest empty state, not a bug. Once the pipeline has run it
returns entries with `startup_id` and `similarity`.

To see it work now, temporarily populate vectors from mock:

```bash
node -e "const fs=require('fs');fs.copyFileSync('data/startups.enriched.json','data/.bak');fs.copyFileSync('data/startups.mock.json','data/startups.enriched.json')"
pnpm pipeline:embed
node -e "const fs=require('fs');fs.copyFileSync('data/.bak','data/startups.enriched.json');fs.unlinkSync('data/.bak')"
```

Re-run the demo. Expected: Fetchly first, similarity above 0.3. Then restore:

```bash
node -e "require('fs').writeFileSync('data/startups.vectors.json','{}\n')"
```

- [ ] **Step 3: Commit**

```bash
git add lib/forum/match.ts
git commit -m "feat(forum): run the graveyard matcher over a new post"
```

---

## Task 5: `POST /api/forum/posts`

**Files:**
- Create: `app/api/forum/posts/route.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1: Add the row types**

In `lib/types.ts`, below `Profile`:

```ts
/** A forum post as stored. */
export type ForumPost = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
};

/** A forum comment as stored. `parent_id` gives one level of nesting. */
export type ForumComment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
};
```

- [ ] **Step 2: Write the route**

```ts
/**
 * POST /api/forum/posts — create a post. Owner: Yeriel.
 *
 * Order matters here, and it is not arbitrary. See forum-spec.md §5.
 *
 * The insert uses the CALLER'S token, so RLS enforces `auth.uid() = author_id`
 * at the database. author_id comes from the verified session and is never read
 * from the body — accepting it from the client is how this class of endpoint
 * gets impersonation bugs.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaller } from "@/lib/forum/session";
import { countRecentWrites, isOverLimit, LIMITS } from "@/lib/forum/ratelimit";
import { parseMentions } from "@/lib/forum/mentions";
import { matchPost } from "@/lib/forum/match";
import { loadStartups } from "@/lib/data";
import type { ApiError, ForumPost } from "@/lib/types";

export const runtime = "nodejs";
/** Embeds, so it needs more than the other forum routes. */
export const maxDuration = 30;

type CreatePostRequest = { title?: string; body?: string };

export async function POST(
  request: Request,
): Promise<NextResponse<ForumPost | ApiError>> {
  const caller = await getCaller();
  if (!caller) {
    return NextResponse.json({ error: "you must be signed in to post" }, { status: 401 });
  }

  let payload: CreatePostRequest;
  try {
    payload = (await request.json()) as CreatePostRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (title.length < 3 || title.length > 200) {
    return NextResponse.json(
      { error: "title must be between 3 and 200 characters" },
      { status: 400 },
    );
  }
  if (body.length < 1 || body.length > 10000) {
    return NextResponse.json(
      { error: "body must be between 1 and 10000 characters" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const recent = await countRecentWrites(supabase, "post", caller.userId);
  if (isOverLimit(recent, "post")) {
    return NextResponse.json(
      {
        error: `you can post ${LIMITS.post.max} times every ${LIMITS.post.windowMinutes} minutes`,
      },
      { status: 429 },
    );
  }

  const { data: post, error } = await supabase
    .from("posts")
    .insert({ author_id: caller.userId, title, body })
    .select()
    .single();

  if (error || !post) {
    console.error("posts: insert failed:", error?.message);
    return NextResponse.json({ error: "could not create the post" }, { status: 500 });
  }

  // Everything below is derived and FAILS SOFT. The post already exists; a 500
  // here would make the user retry and duplicate their content. A post without
  // tombstones is worse than one with them, but far better than two posts.
  try {
    const admin = createAdminClient();

    const startupIds = parseMentions(`${title} ${body}`, loadStartups());
    if (startupIds.length > 0) {
      await admin.from("mentions").insert(
        startupIds.map((startup_id) => ({
          source_type: "post" as const,
          source_id: post.id,
          startup_id,
        })),
      );
    }

    const matches = await matchPost(title, body);
    if (matches.length > 0) {
      await admin
        .from("post_matches")
        .insert(matches.map((m) => ({ post_id: post.id, ...m })));
    }
  } catch (err) {
    console.error("posts: derived rows failed for", post.id, err);
  }

  return NextResponse.json(post as ForumPost, { status: 201 });
}
```

- [ ] **Step 3: Verify auth is required**

```bash
pnpm dev
curl -s -w " [%{http_code}]" -X POST http://localhost:3000/api/forum/posts \
  -H 'content-type: application/json' \
  -d '{"title":"Test post","body":"hello"}'
```

Expected: `{"error":"you must be signed in to post"} [401]`.

- [ ] **Step 4: Verify a real post, and that a forged author is ignored**

```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"yeriel@example.com","password":"password123"}' > /dev/null

curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/posts \
  -H 'content-type: application/json' \
  -d '{"title":"Grocery delivery in the suburbs","body":"Same-day to low-density postcodes. @fetchly tried this. Dumb?","author_id":"00000000-0000-0000-0000-000000000000"}'
```

Expected: 201, and the returned `author_id` is **your** user id, not the zeroes.
If it is the zeroes, the route is reading author from the body — stop and fix it.

Then in the SQL Editor:

```sql
select source_id, startup_id from public.mentions;
```

Expected: one row with `startup_id = 'mock-001'`, from the `@fetchly`.

- [ ] **Step 5: Verify validation and the throttle**

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/posts -H 'content-type: application/json' -d '{"title":"ab","body":"x"}'
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/posts -H 'content-type: application/json' -d '{"title":"Valid title here","body":""}'
for i in 1 2 3 4 5; do curl -s -o /dev/null -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/posts -H 'content-type: application/json' -d "{\"title\":\"Spam number $i\",\"body\":\"spam\"}"; done
curl -s -w " [%{http_code}]" -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/posts -H 'content-type: application/json' -d '{"title":"One too many","body":"spam"}'
```

Expected: a 400 for the short title, a 400 for the empty body, then `[429]` with
the "5 times every 10 minutes" message.

- [ ] **Step 6: Commit**

```bash
git add app/api/forum/posts/route.ts lib/types.ts
git commit -m "feat(forum): create a post, with mentions and graveyard matches"
```

---

## Task 6: `POST /api/forum/comments`

**Files:**
- Create: `app/api/forum/comments/route.ts`

- [ ] **Step 1: Write the route**

```ts
/**
 * POST /api/forum/comments — reply to a post, or to one comment. Owner: Yeriel.
 *
 * Same shape as the posts route minus the matcher: a comment does not get its
 * own tombstones, because the post it hangs under already has them.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaller } from "@/lib/forum/session";
import { countRecentWrites, isOverLimit, LIMITS } from "@/lib/forum/ratelimit";
import { parseMentions } from "@/lib/forum/mentions";
import { loadStartups } from "@/lib/data";
import type { ApiError, ForumComment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 15;

type CreateCommentRequest = { postId?: string; parentId?: string | null; body?: string };

export async function POST(
  request: Request,
): Promise<NextResponse<ForumComment | ApiError>> {
  const caller = await getCaller();
  if (!caller) {
    return NextResponse.json({ error: "you must be signed in to comment" }, { status: 401 });
  }

  let payload: CreateCommentRequest;
  try {
    payload = (await request.json()) as CreateCommentRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const postId = typeof payload.postId === "string" ? payload.postId : "";
  const parentId = typeof payload.parentId === "string" ? payload.parentId : null;
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!postId) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }
  if (body.length < 1 || body.length > 5000) {
    return NextResponse.json(
      { error: "body must be between 1 and 5000 characters" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // The schema cannot express "parent must belong to the same post", so the
  // route must. Without it a reply can be grafted onto an unrelated thread.
  if (parentId) {
    const { data: parent } = await supabase
      .from("comments")
      .select("post_id")
      .eq("id", parentId)
      .single();
    if (!parent || parent.post_id !== postId) {
      return NextResponse.json(
        { error: "parentId does not belong to that post" },
        { status: 400 },
      );
    }
  }

  const recent = await countRecentWrites(supabase, "comment", caller.userId);
  if (isOverLimit(recent, "comment")) {
    return NextResponse.json(
      {
        error: `you can comment ${LIMITS.comment.max} times every ${LIMITS.comment.windowMinutes} minutes`,
      },
      { status: 429 },
    );
  }

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, author_id: caller.userId, parent_id: parentId, body })
    .select()
    .single();

  if (error || !comment) {
    console.error("comments: insert failed:", error?.message);
    return NextResponse.json({ error: "could not create the comment" }, { status: 500 });
  }

  // Derived, fails soft. Same reasoning as the posts route.
  try {
    const startupIds = parseMentions(body, loadStartups());
    if (startupIds.length > 0) {
      await createAdminClient()
        .from("mentions")
        .insert(
          startupIds.map((startup_id) => ({
            source_type: "comment" as const,
            source_id: comment.id,
            startup_id,
          })),
        );
    }
  } catch (err) {
    console.error("comments: mentions failed for", comment.id, err);
  }

  return NextResponse.json(comment as ForumComment, { status: 201 });
}
```

- [ ] **Step 2: Verify**

Take a post id from Task 5 (`select id from public.posts limit 1;`) and use it
as `<POST_ID>`:

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/comments \
  -H 'content-type: application/json' \
  -d '{"postId":"<POST_ID>","body":"@coursewell had the same leak"}'
```

Expected: 201, and a `mentions` row with `source_type = 'comment'` and
`startup_id = 'mock-003'`.

- [ ] **Step 3: Verify the cross-thread guard**

Create a second post, then try to attach a reply to a comment from the first:

```bash
curl -s -w " [%{http_code}]" -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/comments \
  -H 'content-type: application/json' \
  -d '{"postId":"<SECOND_POST_ID>","parentId":"<COMMENT_ID_FROM_FIRST_POST>","body":"grafted"}'
```

Expected: `{"error":"parentId does not belong to that post"} [400]`.

- [ ] **Step 4: Commit**

```bash
git add app/api/forum/comments/route.ts
git commit -m "feat(forum): comments with one level of nesting and a cross-thread guard"
```

---

## Task 7: `POST /api/forum/like`

**Files:**
- Create: `app/api/forum/like/route.ts`

- [ ] **Step 1: Write the route**

```ts
/**
 * POST /api/forum/like — toggle a like. Owner: Yeriel.
 *
 * Idempotent by construction: the composite primary key on
 * (user_id, target_type, target_id) makes a second like impossible, so a
 * double-click cannot produce two rows no matter how the requests interleave.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCaller } from "@/lib/forum/session";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 10;

type LikeRequest = { targetType?: "post" | "comment"; targetId?: string };

export async function POST(
  request: Request,
): Promise<NextResponse<{ liked: boolean; count: number } | ApiError>> {
  const caller = await getCaller();
  if (!caller) {
    return NextResponse.json({ error: "you must be signed in to like" }, { status: 401 });
  }

  let payload: LikeRequest;
  try {
    payload = (await request.json()) as LikeRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const targetType = payload.targetType;
  const targetId = typeof payload.targetId === "string" ? payload.targetId : "";

  if (targetType !== "post" && targetType !== "comment") {
    return NextResponse.json(
      { error: 'targetType must be "post" or "comment"' },
      { status: 400 },
    );
  }
  if (!targetId) {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const key = { user_id: caller.userId, target_type: targetType, target_id: targetId };

  const { data: existing } = await supabase
    .from("likes")
    .select("user_id")
    .match(key)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    const { error } = await supabase.from("likes").delete().match(key);
    if (error) {
      console.error("like: delete failed:", error.message);
      return NextResponse.json({ error: "could not update the like" }, { status: 500 });
    }
    liked = false;
  } else {
    const { error } = await supabase.from("likes").insert(key);
    if (error) {
      console.error("like: insert failed:", error.message);
      return NextResponse.json({ error: "could not update the like" }, { status: 500 });
    }
    liked = true;
  }

  // count(*) rather than a counter column. Served by likes_target_idx, and it
  // cannot drift out of sync with reality the way a maintained counter can.
  const { count } = await supabase
    .from("likes")
    .select("user_id", { count: "exact", head: true })
    .eq("target_type", targetType)
    .eq("target_id", targetId);

  return NextResponse.json({ liked, count: count ?? 0 });
}
```

- [ ] **Step 2: Verify the toggle**

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/like \
  -H 'content-type: application/json' -d '{"targetType":"post","targetId":"<POST_ID>"}'
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/like \
  -H 'content-type: application/json' -d '{"targetType":"post","targetId":"<POST_ID>"}'
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/forum/like \
  -H 'content-type: application/json' -d '{"targetType":"post","targetId":"<POST_ID>"}'
```

Expected: `{"liked":true,"count":1}`, `{"liked":false,"count":0}`,
`{"liked":true,"count":1}`.

Then confirm the database agrees there is exactly one row:

```sql
select count(*) from public.likes;
```

Expected: `1`.

- [ ] **Step 3: Commit**

```bash
git add app/api/forum/like/route.ts
git commit -m "feat(forum): like toggle, idempotent via the composite key"
```

---

## Task 8: Reads, and the handover to the frontend

Forum reads do **not** go through route handlers. This task writes down what
Sam and Darryl need, and changes no backend behaviour.

**Files:**
- Create: `docs/forum-reads.md`

- [ ] **Step 1: Write the read guide**

Create `docs/forum-reads.md`:

````markdown
# Forum reads — for the frontend

Reads go from the browser straight to Supabase. There is no `/api/forum/get`,
deliberately: reads are high-volume, cacheable, and benefit from Realtime, while
writes need server-only compute. Splitting them puts each on the path that fits.

Use `createClient()` from `lib/supabase/client.ts`. The anon key is public by
design; RLS is what protects the data.

## Posts list, newest first, cursor paginated

```ts
const { data } = await supabase
  .from("posts")
  .select("id, title, body, created_at, profiles(handle)")
  .order("created_at", { ascending: false })
  .lt("created_at", cursor ?? new Date().toISOString())
  .limit(20);
```

`posts_created_idx` serves this. The cursor is the `created_at` of the last row
you rendered.

## One post with its comments, matches and mentions

```ts
const { data } = await supabase
  .from("posts")
  .select(`
    id, title, body, created_at,
    profiles(handle),
    comments(id, body, parent_id, created_at, profiles(handle)),
    post_matches(startup_id, similarity),
    mentions(startup_id)
  `)
  .eq("id", postId)
  .single();
```

`post_matches` and `mentions` give you startup **ids**. Resolve them against the
corpus you already import — they are not rows in Postgres, so there is no join
to do.

## Live comments

```ts
supabase
  .channel(`post:${postId}`)
  .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${postId}` },
      (payload) => append(payload.new))
  .subscribe();
```

Enable Realtime for `comments` in the dashboard: **Database → Replication → add
`comments` to `supabase_realtime`.** Without that step the subscription connects
and silently never fires, which looks like a frontend bug.

## Rendering `@mentions`

The body stores the raw text. Render `@name` as an inline tombstone chip by
resolving against the corpus with the same normalisation the backend uses —
lowercase, strip everything that is not a letter or digit. An unresolvable
mention stays plain text.

## What writes look like

| | |
|---|---|
| `POST /api/auth/register` | `{handle, email, password}` → 201 |
| `POST /api/auth/login` | `{email, password}` → sets `sb-` cookies |
| `POST /api/auth/logout` | → `{ok:true}` |
| `POST /api/forum/posts` | `{title, body}` → the created post |
| `POST /api/forum/comments` | `{postId, parentId?, body}` → the created comment |
| `POST /api/forum/like` | `{targetType, targetId}` → `{liked, count}` |

All writes need a session. 401 means signed out; **429 means rate limited and
should be shown as such**, not as a generic failure — a user who hits it has
done nothing wrong.
````

- [ ] **Step 2: Full gate**

```bash
pnpm check
pnpm build
pnpm lint
```

Expected: 28 checks pass, build succeeds, lint clean.

- [ ] **Step 3: Confirm the graveyard demo path is untouched**

```bash
curl -s -X POST http://localhost:3000/api/search -H 'content-type: application/json' \
  -d '{"query":"grocery delivery","limit":3}' | head -c 200
```

Expected: matches as before. The forum must not be able to affect this — that
separation is the same reason `/api/search` never called Claude.

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/forum-reads.md
git commit -m "docs(forum): read patterns and Realtime setup for the frontend"
git push -u origin feat/api-accounts
```

- [ ] **Step 5: Post to team chat**

```
Forum backend is in, behind accounts. Reads go direct to Supabase with RLS;
writes go through /api/forum/*.

- Sam + Darryl: docs/forum-reads.md has every query, the Realtime setup, and
  the write endpoints. One dashboard step you cannot skip: Database ->
  Replication -> add `comments` to supabase_realtime, or live comments connect
  and silently never fire.
- Supabase is now a dependency (Postgres + Auth). The team plan lists it as
  cut #1 — Darryl approved this, flagging it so nobody is surprised.
- There is NO content moderation. Rate limiting is 5 posts / 20 comments per 10
  minutes per account, and that slows a script rather than stopping one. If the
  forum is live during judging, someone should be watching it.
- Accounts have no email verification, so there is no password recovery. A
  forgotten password is a dead account.
```

---

## Definition of done

- [ ] `pnpm check` — 28 pass
- [ ] `pnpm build` and `pnpm lint` clean
- [ ] Posting signed out → 401
- [ ] A forged `author_id` in the body is ignored
- [ ] Sixth post inside ten minutes → 429 with a readable message
- [ ] `@fetchly` in a post creates a `mentions` row for `mock-001`
- [ ] An email address in a body creates **no** mention
- [ ] A reply whose `parentId` belongs to another post → 400
- [ ] Liking twice leaves exactly one row and reports `liked:false`
- [ ] `mentions` and `post_matches` have exactly one policy each (select only)
- [ ] `/api/search`, `/api/report` and `/api/reconstruct` still behave identically
