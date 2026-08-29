-- Graveyard forum schema. Owner: Yeriel.
--
-- Idempotent: safe to re-run. This file is the source of truth, not the
-- dashboard — a schema that exists only as SQL someone once pasted into a web
-- UI cannot be reviewed, diffed, or recreated.
--
-- Apply: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.

create extension if not exists citext;

-- ============================================================================
-- ACCOUNTS
-- ============================================================================

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

-- NOTE: because handle is NOT NULL and this trigger runs inside the signup
-- transaction, creating a user from the Supabase dashboard FAILS — a dashboard
-- user has no handle in its metadata. That is deliberate. Accounts are created
-- only through /api/auth/register, so no user can exist without a profile.

-- ============================================================================
-- FORUM
-- ============================================================================

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null check (char_length(title) between 3 and 200),
  body       text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx  on public.posts (author_id);

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

-- What the graveyard says about this post. Derived, never user-written.
create table if not exists public.post_matches (
  post_id    uuid not null references public.posts(id) on delete cascade,
  startup_id text not null,
  similarity real not null check (similarity between 0 and 1),
  primary key (post_id, startup_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles     enable row level security;
alter table public.posts        enable row level security;
alter table public.comments     enable row level security;
alter table public.likes        enable row level security;
alter table public.mentions     enable row level security;
alter table public.post_matches enable row level security;

-- Everything is world-readable. It is a public forum.
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select using (true);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);
-- No insert policy on profiles: rows come from the security-definer trigger,
-- which bypasses RLS. Nothing else may insert one. Absence IS the enforcement.

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
-- only by the service-role client, which bypasses RLS.

-- ============================================================================
-- GRANTS
-- ============================================================================
-- Projects created after 30 May 2026 need explicit grants before PostgREST can
-- see a table. Without these every query returns empty or a permission error
-- that reads exactly like an RLS bug, and you will rewrite correct policies for
-- an hour. Grants say which ROLES may touch a table; RLS says which ROWS.
-- Both are required.

grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles, public.posts, public.comments,
                public.likes, public.mentions, public.post_matches
  to anon, authenticated;

grant update on public.profiles to authenticated;
grant insert, update, delete on public.posts, public.comments to authenticated;
grant insert, delete on public.likes to authenticated;

-- The service-role client bypasses RLS but still needs table grants, and the
-- post-May-2026 rule applies to it too. Without these the derived-row inserts
-- fail into the route's fail-soft catch, and posts quietly ship with no
-- tombstones and no mentions — which presents as a broken matcher, not a
-- permissions error.
grant insert, delete on public.mentions, public.post_matches to service_role;

-- ============================================================================
-- ORPHAN CLEANUP
-- ============================================================================
-- likes.target_id and mentions.source_id are polymorphic (they point at either
-- a post or a comment), so neither can have a foreign key and neither cascades.
-- Without this, deleting a post leaves its likes and mentions behind, and the
-- "every post that mentions @webvan" lookup starts returning ids that resolve
-- to nothing.
create or replace function public.cleanup_orphans()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.likes
   where target_type = tg_argv[0] and target_id = old.id;
  delete from public.mentions
   where source_type = tg_argv[0] and source_id = old.id;
  return old;
end;
$$;

drop trigger if exists on_post_deleted on public.posts;
create trigger on_post_deleted
  after delete on public.posts
  for each row execute function public.cleanup_orphans('post');

drop trigger if exists on_comment_deleted on public.comments;
create trigger on_comment_deleted
  after delete on public.comments
  for each row execute function public.cleanup_orphans('comment');

-- The function needs to delete rows users cannot: security definer covers it.
grant delete on public.likes, public.mentions to service_role;

-- ============================================================================
-- REPORT CACHE
-- ============================================================================
-- Every /api/report answer written by Claude, keyed by what produced it. Two
-- jobs in one table:
--
--   1. Cache. The same idea matched against the same five companies always
--      deserves the same write-up, so the second asker is served from Postgres
--      and costs nothing. On stage this matters: a judge retyping the demo
--      query gets an instant answer instead of a model call.
--   2. Log. Every generated report is inspectable after the fact, with its
--      model, its token counts and the exact records it was given. If Claude
--      says something wrong on stage, the row shows precisely what it was
--      shown.
--
-- `cache_key` is a SHA-256 of model + normalised query + sorted startup ids, so
-- changing the model or the match set is automatically a different row rather
-- than a stale hit. Computed in lib/report-cache.ts.
create table if not exists public.report_cache (
  cache_key     text primary key,
  query         text        not null,
  startup_ids   text[]      not null,
  model         text        not null,
  report        text        not null,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now(),
  hit_count     integer     not null default 0,
  last_used_at  timestamptz not null default now()
);

create index if not exists report_cache_created_idx on public.report_cache (created_at desc);

-- RLS on with NO policies, which is a deny-all for anon and authenticated.
-- Deliberate: these rows are keyed by whatever a stranger typed into the search
-- bar, and there is no reason for one visitor to be able to read another's
-- idea back out of the database. The route reads and writes them through the
-- service-role client, which bypasses RLS.
alter table public.report_cache enable row level security;

-- Delete is for scripts/smoke-report-cache.ts, which writes a reserved row and
-- must be able to take it back out again. This project has no usable default
-- privileges (see the GRANTS block above), so an ungranted delete fails
-- silently and leaves smoke rows in the log forever.
grant select, insert, update, delete on public.report_cache to service_role;

-- Count the hit without rewriting the report. A plain UPDATE from the route
-- would need a read-modify-write; this keeps it to one statement and cannot
-- lose a count to a concurrent request.
create or replace function public.touch_report_cache(key text)
returns void
language sql
security definer set search_path = ''
as $$
  update public.report_cache
     set hit_count = hit_count + 1, last_used_at = now()
   where cache_key = key;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, and `anon`
-- has usage on this schema, so without the revoke below PostgREST exposes this
-- at /rest/v1/rpc/touch_report_cache to anyone. It is SECURITY DEFINER, so that
-- would hand an unauthenticated visitor a write into a table whose RLS is a
-- deliberate deny-all. The grant that follows is what makes it reachable again,
-- for the service role only.
revoke execute on function public.touch_report_cache(text) from public;
grant execute on function public.touch_report_cache(text) to service_role;
