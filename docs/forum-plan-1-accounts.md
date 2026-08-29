# Accounts Implementation Plan (forum, plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can register with a handle, email and password, log in, and log out — with a `profiles` row the forum can key its posts to.

**Architecture:** Supabase Auth holds credentials; a `profiles` table we own holds identity. A `security definer` trigger creates the profile on signup, reading the handle the client passed through `options.data`. Sessions are cookies managed by `@supabase/ssr`. RLS enforces "you can only edit your own row" at the database rather than in route code.

**Tech Stack:** Next.js 16 App Router on Vercel (`syd1`) · Supabase Postgres + Auth · `@supabase/supabase-js` + `@supabase/ssr` · assert-based `scripts/check.ts`, no test framework.

**Spec:** [forum-spec.md](forum-spec.md) §2, §3, §4. This plan covers accounts only. Posts, comments, likes and mentions are [plan 2](forum-plan-2-forum.md).

---

## Blocked until two things happen

1. **Darryl approves adding Supabase.** GRAVEYARD_TEAM_PLAN.md lists it as cut #1 and CLAUDE.md rule 1 requires asking. This is a decision, not a notification.
2. **Someone provisions the Supabase project** and puts the three keys in `.env.local`. That needs an account; it cannot be done from here.

Everything below assumes both are done. Tasks 3 and 4 are the only ones that can be built and verified without a live project.

---

## Testing approach — read before Task 1

No test runner, and none is being added (CLAUDE.md rule 8). The pattern already
in this repo:

- **Pure functions** get an assert in `scripts/check.ts`, run with `pnpm check`.
- **Anything needing the database** gets a `curl` in the task, with the exact
  expected output. It is verified by hand, the same way the three existing
  routes were.

`pnpm check` and `pnpm build` are the gate before any PR.

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `supabase/schema.sql` | tables, trigger, RLS, grants — the versioned source of truth | **create** |
| `lib/supabase/client.ts` | browser client | **create** |
| `lib/supabase/server.ts` | server client bound to the caller's cookies | **create** |
| `lib/supabase/admin.ts` | service-role client, bypasses RLS | **create** (used in plan 2) |
| `lib/forum/handle.ts` | handle validation, pure | **create** |
| `app/api/auth/register/route.ts` | signup | **create** |
| `app/api/auth/login/route.ts` | login | **create** |
| `app/api/auth/logout/route.ts` | logout | **create** |
| `lib/types.ts` | add `Profile` | modify |
| `scripts/check.ts` | handle asserts | modify |
| `.env.example` | uncomment the three Supabase vars | modify |

**The schema lives in a committed file, not only in the dashboard.** A schema
that exists only as SQL someone once pasted into a web UI is unversioned, and
nobody can tell what changed or recreate it. `supabase/schema.sql` is
idempotent, so re-running it is safe.

---

## Task 0: Dependencies, environment, Supabase project

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Branch**

```bash
git checkout feat/api-backend 2>/dev/null || git checkout main
git pull
git checkout -b feat/api-accounts
```

- [ ] **Step 2: Install**

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: Create the Supabase project (manual, needs an account)**

In the Supabase dashboard: new project, any region — pick Sydney if offered,
for the same reason `vercel.json` pins `syd1`.

Then **Authentication → Providers → Email**:

- **Confirm email: OFF**
- Minimum password length: 8

Leave every other provider disabled. Nothing here uses OAuth.

- [ ] **Step 4: Put the keys in `.env.local`**

From **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

`.env.local` is gitignored. The service-role key bypasses RLS entirely — treat
it exactly like `ANTHROPIC_API_KEY`, and never give it a `NEXT_PUBLIC_` prefix.

- [ ] **Step 5: Uncomment the three vars in `.env.example`**

They already exist there, commented out, under "Optional stretch: Supabase".
Uncomment them, delete the "NOT used by the demo" note above them, and leave the
values empty. Add one line under `SUPABASE_SERVICE_ROLE_KEY`:

```
# Server-side only. Bypasses Row Level Security completely. Never NEXT_PUBLIC_.
```

- [ ] **Step 6: Verify the build still passes**

```bash
pnpm build
```

Expected: success. Nothing imports Supabase yet; this catches a bad install.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore(auth): add Supabase client packages and environment"
```

---

## Task 1: Schema — profiles, trigger, RLS, grants

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write the schema file**

Create `supabase/schema.sql`:

```sql
-- Graveyard forum schema. Owner: Yeriel.
--
-- Idempotent: safe to re-run. This file is the source of truth, not the
-- dashboard — a schema that exists only as SQL someone once pasted into a web
-- UI cannot be reviewed, diffed, or recreated.
--
-- Apply: Supabase dashboard -> SQL Editor -> paste -> Run.

create extension if not exists citext;

-- ---------------------------------------------------------------- profiles
-- auth.users holds credentials. This holds identity.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     citext unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

-- Creates the profile row on signup, reading the handle the client passed
-- through auth options.data.
--
-- `security definer` is required: the signing-up user has no rights on
-- public.profiles yet. `set search_path = ''` is required WITH it — a
-- security-definer function without a pinned search_path is a privilege
-- escalation path, because a caller can shadow the tables it references.
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

-- ------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles
  for select using (true);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

-- No insert policy, deliberately. Profile rows are created by the
-- security-definer trigger above, which bypasses RLS. Nothing else may insert
-- one. The absence of a policy IS the enforcement.

-- ---------------------------------------------------------------- grants
-- Projects created after 30 May 2026 need explicit grants before PostgREST can
-- see a table. Without these, every query returns empty and it looks exactly
-- like an RLS bug — you will rewrite correct policies for an hour.
--
-- Grants say which ROLES may touch a table. RLS says which ROWS. Both required.
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
```

- [ ] **Step 2: Apply it**

Supabase dashboard → SQL Editor → paste the file → Run.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify the table and policies exist**

In the SQL Editor:

```sql
select tablename, policyname, cmd from pg_policies where schemaname = 'public';
```

Expected: two rows — `read profiles / SELECT` and `update own profile / UPDATE`.
If you see an insert policy, you pasted an older version; there must not be one.

- [ ] **Step 4: Verify the trigger fires — and that it refuses a missing handle**

Dashboard → Authentication → Users → **Add user** → any email and password.

Expected: **the creation FAILS**, with a not-null violation on
`profiles.handle`.

That is the correct result and worth understanding, because it will confuse
someone later. A user added through the dashboard has no `handle` in its
metadata, so the trigger inserts NULL, the `not null` constraint rejects it,
and because the trigger is `after insert` inside the same transaction, the
`auth.users` row rolls back with it.

**So accounts cannot be created from the Supabase dashboard at all** — only
through `/api/auth/register`, which always sends a handle. That is a feature:
there is no way to end up with a user who has no profile.

Confirm nothing was left behind:

```sql
select count(*) from auth.users;
select count(*) from public.profiles;
```

Expected: `0` and `0`.
- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(auth): profiles table, signup trigger, RLS and PostgREST grants"
```

---

## Task 2: Supabase client utilities

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Browser client**

Create `lib/supabase/client.ts`:

```ts
/**
 * Supabase client for client components. Owner: Yeriel.
 *
 * Uses the anon key, which is public by design — it is useless without RLS
 * policies granting it something. RLS is what protects the data, not secrecy.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Server client**

Create `lib/supabase/server.ts`:

```ts
/**
 * Supabase client bound to the CALLER'S cookies. Owner: Yeriel.
 *
 * Route handlers use this, not the admin client, so RLS stays live on every
 * write: "you can only edit your own post" is a database refusal rather than an
 * `if` someone forgets. The admin client is for derived rows only.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  // cookies() is async in Next 16.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: route handlers and Server Actions can still set.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Admin client**

Create `lib/supabase/admin.ts`:

```ts
/**
 * Service-role client. Owner: Yeriel.
 *
 * BYPASSES ROW LEVEL SECURITY COMPLETELY. Every guarantee the policies give you
 * is off for anything done through this client.
 *
 * Used for exactly one thing: inserting DERIVED rows the user never writes
 * directly — mentions and post_matches in plan 2. If you find yourself reaching
 * for it to insert a post or a comment, stop: that is the caller's token's job,
 * and using this instead silently disables ownership enforcement.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Copy .env.example to .env.local and add it.",
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`persistSession: false` matters: the admin client must never write a session
cookie. It has no user and represents no one.

- [ ] **Step 4: Verify the build**

```bash
pnpm build
```

Expected: success. If it complains that `server-only` cannot be imported, some
client component is importing `lib/supabase/server.ts` — that is the guard doing
its job. Use `lib/supabase/client.ts` there instead.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/
git commit -m "feat(auth): browser, server and service-role Supabase clients"
```

---

## Task 3: Handle validation

Buildable and verifiable with no Supabase project.

**Files:**
- Create: `lib/forum/handle.ts`
- Modify: `lib/types.ts`
- Modify: `scripts/check.ts`

- [ ] **Step 1: Write the failing checks**

Add to the imports in `scripts/check.ts`:

```ts
import { isValidHandle, HANDLE_RULE } from "../lib/forum/handle";
```

And inside `main()`, before the closing `console.log`:

```ts
  await check("handle: accepts lowercase, digits and underscore, 3-20 chars", () => {
    assert.equal(isValidHandle("yeriel"), true);
    assert.equal(isValidHandle("yeriel_1"), true);
    assert.equal(isValidHandle("a_b_c"), true);
  });

  await check("handle: rejects too short, too long, uppercase and punctuation", () => {
    assert.equal(isValidHandle("ab"), false);
    assert.equal(isValidHandle("a".repeat(21)), false);
    assert.equal(isValidHandle("Yeriel"), false);
    assert.equal(isValidHandle("a-b"), false);
    assert.equal(isValidHandle("a b"), false);
    assert.equal(isValidHandle(""), false);
  });

  await check("handle: the route regex and the schema constraint are the same rule", () => {
    // supabase/schema.sql has: check (handle ~ '^[a-z0-9_]{3,20}$')
    assert.equal(HANDLE_RULE.source, "^[a-z0-9_]{3,20}$");
  });
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm check
```

Expected: the 19 existing checks pass; the three handle checks FAIL with a
module-not-found error for `../lib/forum/handle`.

- [ ] **Step 3: Implement**

Create `lib/forum/handle.ts`:

```ts
/**
 * Handle validation. Owner: Yeriel.
 *
 * Pure, so it can be checked without a database.
 *
 * This regex is duplicated as a `check` constraint in supabase/schema.sql, on
 * purpose. The route validates so the user gets a readable error; the database
 * validates because the route is not the only thing that can ever insert.
 * scripts/check.ts asserts the two stay identical.
 */

/** Lowercase letters, digits and underscore. 3-20 characters. */
export const HANDLE_RULE = /^[a-z0-9_]{3,20}$/;

/**
 * Handles are lowercase ONLY, and invalid input is rejected rather than
 * silently lowercased. Quietly transforming what someone typed means they get a
 * different handle from the one they chose, which reads as a bug.
 *
 * `citext` in the schema still makes lookups case-insensitive, so nobody can
 * register `Webvan` alongside `webvan`.
 */
export function isValidHandle(handle: unknown): boolean {
  return typeof handle === "string" && HANDLE_RULE.test(handle);
}
```

- [ ] **Step 4: Add the `Profile` type**

In `lib/types.ts`, below `StartupVectors`:

```ts
/** A forum account's public identity. auth.users holds the credentials. */
export type Profile = {
  id: string;
  handle: string;
  created_at: string;
};
```

- [ ] **Step 5: Run the checks**

```bash
pnpm check
```

Expected: all 22 pass.

- [ ] **Step 6: Commit**

```bash
git add lib/forum/handle.ts lib/types.ts scripts/check.ts
git commit -m "feat(auth): handle validation, asserted against the schema constraint"
```

---

## Task 4: Registration

**Files:**
- Create: `app/api/auth/register/route.ts`

- [ ] **Step 1: Write the route**

```ts
/**
 * POST /api/auth/register — create an account. Owner: Yeriel.
 *
 * Email confirmation is OFF (forum-spec.md §2), so the account is usable
 * immediately. Two consequences that are decisions, not oversights: there is no
 * account recovery, and nothing proves the email belongs to anyone. Email is a
 * login identifier here, not a contact channel.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidHandle } from "@/lib/forum/handle";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 10;

type RegisterRequest = { handle?: string; email?: string; password?: string };

export async function POST(
  request: Request,
): Promise<NextResponse<{ userId: string; handle: string } | ApiError>> {
  let body: RegisterRequest;
  try {
    body = (await request.json()) as RegisterRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const handle = typeof body.handle === "string" ? body.handle.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidHandle(handle)) {
    return NextResponse.json(
      { error: "handle must be 3-20 characters, lowercase letters, digits or underscore" },
      { status: 400 },
    );
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "a valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // The trigger in supabase/schema.sql reads this to create the profile row.
    options: { data: { handle } },
  });

  if (error) {
    // A duplicate handle surfaces as a Postgres 23505 raised inside the trigger,
    // which Supabase reports as a signup failure. Map it to something a person
    // can act on rather than leaking a constraint name.
    const duplicateHandle =
      error.message.includes("profiles_handle_key") || error.message.includes("23505");
    if (duplicateHandle) {
      return NextResponse.json({ error: "that handle is taken" }, { status: 409 });
    }
    if (error.message.toLowerCase().includes("already registered")) {
      return NextResponse.json({ error: "that email already has an account" }, { status: 409 });
    }
    console.error("register: signUp failed:", error.message);
    return NextResponse.json({ error: "could not create the account" }, { status: 500 });
  }

  if (!data.user) {
    return NextResponse.json({ error: "could not create the account" }, { status: 500 });
  }

  return NextResponse.json({ userId: data.user.id, handle }, { status: 201 });
}
```

- [ ] **Step 2: Verify the validation boundary — no database needed**

```bash
pnpm dev
```

In another terminal:

```bash
curl -s -X POST http://localhost:3000/api/auth/register -H 'content-type: application/json' -d '{"handle":"ab","email":"a@b.co","password":"password1"}'
curl -s -X POST http://localhost:3000/api/auth/register -H 'content-type: application/json' -d '{"handle":"Yeriel","email":"a@b.co","password":"password1"}'
curl -s -X POST http://localhost:3000/api/auth/register -H 'content-type: application/json' -d '{"handle":"yeriel","email":"nope","password":"password1"}'
curl -s -X POST http://localhost:3000/api/auth/register -H 'content-type: application/json' -d '{"handle":"yeriel","email":"a@b.co","password":"short"}'
```

Expected, in order:

```
{"error":"handle must be 3-20 characters, lowercase letters, digits or underscore"}
{"error":"handle must be 3-20 characters, lowercase letters, digits or underscore"}
{"error":"a valid email is required"}
{"error":"password must be at least 8 characters"}
```

- [ ] **Step 3: Verify a real signup**

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"handle":"yeriel","email":"yeriel@example.com","password":"password123"}'
```

Expected: `{"userId":"<uuid>","handle":"yeriel"}` with status 201.

Then in the Supabase SQL Editor:

```sql
select id, handle, created_at from public.profiles;
```

Expected: one row, `handle = 'yeriel'`. **If `handle` is NULL, the trigger is not
reading `raw_user_meta_data` — check that `options.data` is being passed.**

- [ ] **Step 4: Verify the duplicate-handle path**

```bash
curl -s -w " [%{http_code}]" -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"handle":"yeriel","email":"different@example.com","password":"password123"}'
```

Expected: `{"error":"that handle is taken"} [409]` — not a 500, and no
constraint name in the message.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/register/route.ts
git commit -m "feat(auth): registration with handle, no email confirmation"
```

---

## Task 5: Login and logout

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`

- [ ] **Step 1: Login route**

```ts
/**
 * POST /api/auth/login — exchange credentials for a session. Owner: Yeriel.
 *
 * @supabase/ssr writes the session cookies through the client created in
 * lib/supabase/server.ts. Nothing custom, no token handling here.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 10;

type LoginRequest = { email?: string; password?: string };

export async function POST(
  request: Request,
): Promise<NextResponse<{ userId: string } | ApiError>> {
  let body: LoginRequest;
  try {
    body = (await request.json()) as LoginRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // One message for both "no such email" and "wrong password", on purpose.
    // Distinguishing them tells an attacker which emails are registered.
    return NextResponse.json({ error: "email or password is incorrect" }, { status: 401 });
  }

  return NextResponse.json({ userId: data.user.id });
}
```

- [ ] **Step 2: Logout route**

```ts
/**
 * POST /api/auth/logout — end the session. Owner: Yeriel.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(): Promise<NextResponse<{ ok: true } | ApiError>> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("logout: signOut failed:", error.message);
    return NextResponse.json({ error: "could not sign out" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify the round trip**

```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"yeriel@example.com","password":"password123"}'
```

Expected: `{"userId":"<uuid>"}`, and `/tmp/cookies.txt` now contains cookies
whose names start with `sb-`.

```bash
curl -s -w " [%{http_code}]" -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"yeriel@example.com","password":"wrongpassword"}'
curl -s -w " [%{http_code}]" -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com","password":"password123"}'
```

Expected: **the same** `{"error":"email or password is incorrect"} [401]` for
both. If they differ, the route is leaking which emails exist.

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/auth/logout
```

Expected: `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/login/route.ts app/api/auth/logout/route.ts
git commit -m "feat(auth): login and logout, with a non-enumerable failure message"
```

---

## Task 6: The session helper plan 2 depends on

**Files:**
- Create: `lib/forum/session.ts`

- [ ] **Step 1: Write it**

```ts
/**
 * Resolve the caller. Owner: Yeriel.
 *
 * Every forum write starts here. The returned id is the ONLY acceptable source
 * of `author_id` — reading it from the request body instead is how this class
 * of endpoint gets impersonation bugs, and it is the single most common way
 * they are introduced.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Caller = { userId: string; handle: string };

/**
 * Returns the signed-in caller, or null.
 *
 * Uses getUser(), not getSession(). getSession() reads the cookie and trusts
 * it; getUser() revalidates against the auth server. On a write path that
 * difference is the whole point.
 */
export async function getCaller(): Promise<Caller | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return { userId: user.id, handle: profile.handle as string };
}
```

- [ ] **Step 2: Verify it resolves a logged-in caller**

Add a temporary route, `app/api/auth/whoami/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/forum/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const caller = await getCaller();
  return NextResponse.json(caller ?? { caller: null });
}
```

```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"yeriel@example.com","password":"password123"}' > /dev/null
curl -s -b /tmp/cookies.txt http://localhost:3000/api/auth/whoami
curl -s http://localhost:3000/api/auth/whoami
```

Expected: `{"userId":"<uuid>","handle":"yeriel"}` with the cookie jar, and
`{"caller":null}` without it.

- [ ] **Step 3: Delete the temporary route**

```bash
rm -rf app/api/auth/whoami
```

It exists to prove the helper works, not to ship. Plan 2 exercises `getCaller()`
through every write route.

- [ ] **Step 4: Full gate**

```bash
pnpm check
pnpm build
pnpm lint
```

Expected: 22 checks pass, build succeeds, lint clean.

- [ ] **Step 5: Commit**

```bash
git add lib/forum/session.ts
git commit -m "feat(auth): getCaller(), the only source of author identity"
```

---

## Definition of done

- [ ] `pnpm check` — 22 pass
- [ ] `pnpm build` and `pnpm lint` clean
- [ ] Register with a valid handle → 201, and a `profiles` row with that handle
- [ ] Register with a taken handle → 409, not 500
- [ ] Register with `Yeriel`, `ab`, a bad email or a short password → 400
- [ ] Wrong password and unknown email return the **same** 401 message
- [ ] Login sets `sb-` cookies; logout clears them
- [ ] `getCaller()` returns the user with a cookie and null without one
- [ ] `supabase/schema.sql` is committed and re-running it is a no-op
- [ ] The demo path still clicks through — accounts touch none of it

---

## What plan 2 needs from this

- `getCaller()` — every forum write route starts with it
- `createClient()` from `lib/supabase/server.ts` — writes go through the
  caller's token so RLS stays live
- `createAdminClient()` — derived rows only (mentions, post_matches)
- `supabase/schema.sql` — plan 2 appends its tables to the same file
