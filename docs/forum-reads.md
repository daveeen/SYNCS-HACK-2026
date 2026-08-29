# Forum reads — for the frontend

Owner: **Yeriel** (the endpoints). Consumers: **Sam** and **Darryl**.

Forum reads go from the browser **straight to Supabase**. There is no
`/api/forum/get`, deliberately: reads are high-volume and cacheable and benefit
from Realtime, while writes need server-only compute (the graveyard matcher runs
`embedOne()`, which is Node-only). Splitting them puts each on the path that
suits it.

This is a real departure from "server logic = route handlers only" in
GRAVEYARD_TEAM_PLAN.md, and Darryl agreed to it explicitly.

Use `createClient()` from [`lib/supabase/client.ts`](../lib/supabase/client.ts).
The anon key is public by design — it ships to the browser. Row Level Security
is what protects the data, not secrecy of that key.

---

## Posts list, newest first, cursor paginated

```ts
const { data } = await supabase
  .from("posts")
  .select("id, title, body, created_at, profiles(handle)")
  .order("created_at", { ascending: false })
  .lt("created_at", cursor ?? new Date().toISOString())
  .limit(20);
```

Served by `posts_created_idx`. The cursor is the `created_at` of the last row
you rendered — not an offset, so new posts arriving mid-scroll cannot make you
skip or repeat one.

## One post, with everything hanging off it

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

`post_matches` and `mentions` give you startup **ids**, not rows. The corpus
lives in `data/startups.*.json`, which you already import — resolve the ids
against that. There is no join to do, and no foreign key, because the corpus is
not in Postgres.

## Live comments

```ts
supabase
  .channel(`post:${postId}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${postId}` },
    (payload) => append(payload.new),
  )
  .subscribe();
```

> **One dashboard step you cannot skip.** Enable Realtime for `comments`:
> **Database → Replication → add `comments` to `supabase_realtime`.**
> Without it the subscription connects successfully and silently never fires,
> which looks exactly like a frontend bug and is not one.

## Rendering `@mentions`

The body stores the raw text the user typed. Render `@name` as an inline
tombstone chip by resolving against the corpus with the **same normalisation the
backend uses** — lowercase, then strip everything that is not a letter or digit.
So `@orbitalpost` resolves to "Orbital Post".

An unresolvable mention stays plain text. Do not guess, and do not link to a
near match.

Note the backend only records a mention when it resolves, so
`mentions(startup_id)` is already the filtered set. The client-side rendering
exists to place the chip inline; the table exists so a dead startup's page can
list every post that mentions it.

---

## Writes — these go through route handlers

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/auth/register` | `{handle, email, password}` | `{userId, handle}`, 201 |
| `POST /api/auth/login` | `{email, password}` | `{userId}`, sets `sb-` cookies |
| `POST /api/auth/logout` | — | `{ok:true}` |
| `POST /api/forum/posts` | `{title, body}` | the created post, 201 |
| `POST /api/forum/comments` | `{postId, parentId?, body}` | the created comment, 201 |
| `POST /api/forum/like` | `{targetType, targetId}` | `{liked, count}` |

Every forum write needs a session. Cookies are set by the login route and sent
automatically — you do not handle tokens.

### Status codes worth handling distinctly

| | Meaning | What to show |
|---|---|---|
| `400` | validation — the `error` string is written for humans | show it verbatim |
| `401` | signed out | prompt to sign in, keep their draft |
| `409` | handle or email already taken | show it on the field |
| **`429`** | **rate limited** | **show it as such** — 5 posts / 20 comments per 10 min |
| `500` | our fault | generic retry |

**429 deserves its own state.** A user who hits it has done nothing wrong, and
showing "something went wrong" makes a working safeguard look like a bug.

### Handle rules, so your form matches the server

Lowercase letters, digits and underscore. 3–20 characters. The server
**rejects** uppercase rather than lowercasing it — quietly transforming input
means someone gets a different handle from the one they chose. Validate the same
way client-side so they find out before they submit.

---

## What the forum deliberately does not have

- **No content moderation.** Rate limiting is the only abuse control, and it
  slows a script rather than stopping one.
- **No downvotes, no karma, no hot sort.** Likes and reverse-chronological.
- **No edit history, no soft delete.** Delete is a delete.
- **No notifications, no search over posts.** The graveyard matcher is the only
  retrieval in the feature.
- **No password recovery.** Email confirmation is off, so there is no verified
  address to send a reset to. A forgotten password is a dead account.

Each is a deliberate omission. Adding any is a new decision, not a completion of
this one.
