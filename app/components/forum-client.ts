/**
 * Real forum data layer for ForumWindow — the thing forum-mock-data.ts was a
 * stand-in for. Reads go straight to Supabase with the anon key (RLS-gated),
 * writes go through app/api/forum/* and app/api/auth/* (see docs/forum-reads.md
 * and docs/forum-spec.md §5). Nothing here calls the service-role client —
 * that only ever runs inside a route handler.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in
 * .env.local. Without them, createClient() throws a message that says so
 * (lib/supabase/client.ts / server.ts), and every function below surfaces
 * that as a normal rejected promise for the caller to render.
 */
import { createClient } from "@/lib/supabase/client";
import type { ApiError, FailedStartup, ForumComment, ForumPost } from "@/lib/types";

export type Session = { userId: string; handle: string };

export type FeedPost = ForumPost & {
  authorHandle: string;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  /** Resolved startup ids this post mentions — corpus lookup happens in the UI. */
  mentionIds: string[];
};

export type DetailComment = ForumComment & { authorHandle: string };

export type PostDetail = FeedPost & { comments: DetailComment[] };

/** Same normalisation as lib/forum/mentions.ts, mirrored here because the
    server-only module can't be imported into a client component. Kept in
    sync by hand; scripts/check.ts is the backend's own guard on the pair. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const MENTION_TOKEN = /(^|\s)@([a-z0-9_]{2,40})/gi;

/** Startup names for a set of resolved ids, in the shape the mention pill needs. */
export function resolveMentionNames(ids: string[], startups: FailedStartup[]): string[] {
  const byId = new Map(startups.map((s) => [s.id, s.name]));
  return ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
}

/**
 * Strip only the raw "@token"s that resolved to one of this post's mentions —
 * an unresolved "@something" the user typed has nowhere else to appear, so it
 * stays. Mirrors the request: a mention shows up in MENTIONS, not twice.
 */
export function stripResolvedMentionTokens(body: string, mentionNames: string[]): string {
  if (mentionNames.length === 0) return body;
  const resolved = new Set(mentionNames.map(normalise));
  const out = body.replace(MENTION_TOKEN, (whole, lead: string, token: string) =>
    resolved.has(normalise(token)) ? "" : whole,
  );
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

async function apiError(res: Response): Promise<string> {
  const fallback = `The server answered ${res.status}.`;
  try {
    const parsed = JSON.parse(await res.text()) as Partial<ApiError>;
    return typeof parsed.error === "string" && parsed.error ? parsed.error : fallback;
  } catch {
    return fallback;
  }
}

/** Thin, typed wrapper so a 4xx/5xx becomes a message, not a thrown Response. */
export class ForumApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ForumApiError(res.status, await apiError(res));
  return (await res.json()) as T;
}

/** Current session, or null if signed out. Revalidates against the auth
    server (getUser(), not getSession()) — same reasoning as lib/forum/session.ts. */
export async function getSession(): Promise<Session | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", user.id).single();
  if (!profile) return null;

  return { userId: user.id, handle: profile.handle as string };
}

/** Fires on sign-in, sign-out, and token refresh. Returns the unsubscribe fn. */
export function onSessionChange(cb: (session: Session | null) => void): () => void {
  const supabase = createClient();
  const { data } = supabase.auth.onAuthStateChange(() => {
    void getSession().then(cb);
  });
  return () => data.subscription.unsubscribe();
}

export async function registerAccount(handle: string, email: string, password: string): Promise<Session> {
  const { userId, handle: confirmedHandle } = await postJson<{ userId: string; handle: string }>(
    "/api/auth/register",
    { handle, email, password },
  );
  return { userId, handle: confirmedHandle };
}

export async function login(email: string, password: string): Promise<Session> {
  const { userId } = await postJson<{ userId: string }>("/api/auth/login", { email, password });
  const supabase = createClient();
  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", userId).single();
  if (!profile) throw new ForumApiError(500, "signed in, but no profile was found for this account");
  return { userId, handle: profile.handle as string };
}

export async function logout(): Promise<void> {
  await postJson<{ ok: true }>("/api/auth/logout", {});
}

/**
 * The feed: newest 30 posts, joined with author handle, comment count, like
 * count and (if signed in) whether the caller already liked each one.
 * forum-reads.md's cursor pagination is real pagination for a growing forum;
 * a hackathon demo's post count doesn't need it yet, so this loads one page.
 */
export async function fetchFeed(userId: string | null): Promise<FeedPost[]> {
  const supabase = createClient();

  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, author_id, title, body, created_at, profiles(handle)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  const rows = (posts ?? []) as unknown as (ForumPost & { profiles: { handle: string } | null })[];
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const [{ data: comments }, { data: likes }, { data: mentions }] = await Promise.all([
    supabase.from("comments").select("post_id").in("post_id", ids),
    supabase.from("likes").select("target_id, user_id").eq("target_type", "post").in("target_id", ids),
    supabase.from("mentions").select("source_id, startup_id").eq("source_type", "post").in("source_id", ids),
  ]);

  const commentCount = new Map<string, number>();
  for (const c of comments ?? []) commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1);

  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const l of likes ?? []) {
    likeCount.set(l.target_id, (likeCount.get(l.target_id) ?? 0) + 1);
    if (userId && l.user_id === userId) likedByMe.add(l.target_id);
  }

  const mentionIds = new Map<string, string[]>();
  for (const m of mentions ?? []) {
    const list = mentionIds.get(m.source_id) ?? [];
    list.push(m.startup_id);
    mentionIds.set(m.source_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    author_id: r.author_id,
    title: r.title,
    body: r.body,
    created_at: r.created_at,
    authorHandle: r.profiles?.handle ?? "unknown",
    commentCount: commentCount.get(r.id) ?? 0,
    likeCount: likeCount.get(r.id) ?? 0,
    likedByMe: likedByMe.has(r.id),
    mentionIds: mentionIds.get(r.id) ?? [],
  }));
}

/** One post plus its comments, for the post view. */
export async function fetchPostDetail(postId: string, userId: string | null): Promise<PostDetail> {
  const supabase = createClient();

  const { data: post, error } = await supabase
    .from("posts")
    .select(
      `id, author_id, title, body, created_at,
       profiles(handle),
       comments(id, post_id, author_id, parent_id, body, created_at, profiles(handle))`,
    )
    .eq("id", postId)
    .single();
  if (error || !post) throw new Error(error?.message ?? "that post could not be found");

  const row = post as unknown as ForumPost & {
    profiles: { handle: string } | null;
    comments: (ForumComment & { profiles: { handle: string } | null })[];
  };

  // mentions.source_id is polymorphic (a post OR a comment id, forum-spec.md
  // §3) so it deliberately has no foreign key to posts — PostgREST's nested
  // `mentions(startup_id)` embed syntax needs one to resolve, and without it
  // fails with "Could not find a relationship between 'posts' and
  // 'mentions'". A plain filtered query, the same shape fetchFeed already
  // uses, doesn't need the relationship at all.
  const [{ count: likeCount }, likedRow, { data: mentionRows }] = await Promise.all([
    supabase
      .from("likes")
      .select("user_id", { count: "exact", head: true })
      .eq("target_type", "post")
      .eq("target_id", postId),
    userId
      ? supabase
          .from("likes")
          .select("user_id")
          .match({ user_id: userId, target_type: "post", target_id: postId })
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("mentions").select("startup_id").eq("source_type", "post").eq("source_id", postId),
  ]);

  return {
    id: row.id,
    author_id: row.author_id,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    authorHandle: row.profiles?.handle ?? "unknown",
    commentCount: row.comments.length,
    likeCount: likeCount ?? 0,
    likedByMe: Boolean(likedRow.data),
    mentionIds: (mentionRows ?? []).map((m) => m.startup_id),
    comments: row.comments
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({ ...c, authorHandle: c.profiles?.handle ?? "unknown" })),
  };
}

/** New comments on this post, live. Enable Realtime on `comments` in the
    Supabase dashboard first (Database -> Replication) — see forum-reads.md;
    without it this connects and never fires, which looks like a bug and isn't
    one. Returns the unsubscribe function. */
export function subscribeToComments(postId: string, onInsert: (comment: DetailComment) => void): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel(`post:${postId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${postId}` },
      (payload) => {
        const row = payload.new as ForumComment;
        // Realtime hands back the raw row, no join. The author is virtually
        // always "me" (I'm the one whose comment just landed) or already in
        // the thread from the initial fetch; a stray id from someone else's
        // client falls back to a one-off profile lookup rather than "unknown".
        void supabase
          .from("profiles")
          .select("handle")
          .eq("id", row.author_id)
          .single()
          .then(({ data }) => onInsert({ ...row, authorHandle: (data?.handle as string) ?? "unknown" }));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function createPost(title: string, body: string): Promise<ForumPost> {
  return postJson<ForumPost>("/api/forum/posts", { title, body });
}

export async function createComment(
  postId: string,
  parentId: string | null,
  body: string,
): Promise<ForumComment> {
  return postJson<ForumComment>("/api/forum/comments", { postId, parentId, body });
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export async function toggleLike(
  targetType: "post" | "comment",
  targetId: string,
): Promise<{ liked: boolean; count: number }> {
  return postJson<{ liked: boolean; count: number }>("/api/forum/like", { targetType, targetId });
}
