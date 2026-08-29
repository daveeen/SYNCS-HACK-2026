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

grant usage on schema public to anon, authenticated;

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
