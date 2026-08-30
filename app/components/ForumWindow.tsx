"use client";

/* ==========================================================================
   FORUM — Sam's canvas.
   --------------------------------------------------------------------------
   Wired to the real backend (Yeriel's, merged from feat/api-backend): reads
   go straight to Supabase under RLS, writes go through /api/forum/* and
   /api/auth/* — exactly the split docs/forum-reads.md and forum-spec.md
   describe. All of that plumbing lives in forum-client.ts; this file is
   view state and layout.

   REQUIRES an .env.local with NEXT_PUBLIC_SUPABASE_URL and
   NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example) — without them Supabase's
   own client throws, which shows up here as the "Forum isn't connected yet"
   banner rather than a silent blank window.

   Layout unchanged from the mockup: one view switch (feed / a post / sign in
   / sign up) inside this single window. Big header = post title, subheading
   = post body. Feed rows are a chat-list layout: avatar far left, title+time
   on top, "@author: preview" + like/comment counts below.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { isValidHandle } from "@/lib/forum/handle";
import type { FailedStartup } from "@/lib/types";
import { BackGlyph, BubbleGlyph, HeartGlyph } from "./ForumGlyphs";
import {
  ForumApiError,
  createComment,
  createPost,
  fetchFeed,
  fetchPostDetail,
  getSession,
  login,
  logout,
  onSessionChange,
  registerAccount,
  resolveMentionIdsFromText,
  resolveMentions,
  stripResolvedMentionTokens,
  subscribeToComments,
  timeAgo,
  toggleLike,
  type DetailComment,
  type FeedPost,
  type PostDetail,
  type Session,
} from "./forum-client";

type View = "feed" | "post" | "signin" | "signup";

type Loadable<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T };

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** 429 is a working safeguard, not a bug — give it its own colour (amber, the
    same convention as the traffic-light minimise dot) so it doesn't read as
    "something broke" the way the validation/rust red does. */
function errColor(err: unknown): string {
  return err instanceof ForumApiError && err.status === 429 ? "var(--gy-tl-min)" : "var(--gy-dead)";
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--gy-s-4) var(--gy-s-5)",
  fontFamily: "var(--gy-font-ui)",
  fontSize: "var(--gy-t-body)",
  color: "var(--gy-ink)",
  background: "var(--gy-surface-sink)",
  border: "1px solid var(--gy-line-soft)",
  borderRadius: "var(--gy-r-field)",
  outline: "none",
};

// Primary action (Post, Reply, Sign in, Create account): the same blue as
// the wallpaper's ground tone (--gy-ground, the base of the landing page's
// gradient) rather than a generic accent — one fewer colour in the palette.
const buttonStyle: React.CSSProperties = {
  padding: "var(--gy-s-4) var(--gy-s-6)",
  fontFamily: "var(--gy-font-ui)",
  fontSize: "var(--gy-t-ui)",
  fontWeight: 600,
  color: "#fdfdfb",
  background: "var(--gy-ground)",
  border: "none",
  borderRadius: "var(--gy-r-field)",
  cursor: "pointer",
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "var(--gy-s-3) var(--gy-s-5)",
  fontFamily: "var(--gy-font-ui)",
  fontSize: "var(--gy-t-ui)",
  color: "var(--gy-ink-dim)",
  background: "transparent",
  border: "1px solid var(--gy-line)",
  borderRadius: "var(--gy-r-field)",
  cursor: "pointer",
};

function Avatar({ handle, size = 26 }: { handle: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: "var(--gy-r-pill)",
        background: "var(--gy-live-dim)",
        color: "var(--gy-live)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--gy-font-mono)",
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {handle.slice(0, 1)}
    </span>
  );
}

/**
 * A resolved @mention of a DEAD startup from the corpus — never the post's
 * author. The two look alike ("@word") so they're kept on separate lines
 * wherever both appear: the plain grey "@handle · time" line always names
 * who wrote the post; this pill, only present when the body actually
 * mentions a company, shows the real name. See "Rendering @mentions" in
 * docs/forum-reads.md.
 */
function MentionRow({ mentions, onOpen }: { mentions: FailedStartup[]; onOpen: (s: FailedStartup) => void }) {
  if (mentions.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--gy-s-3)" }}>
      <span
        style={{
          fontSize: "var(--gy-t-micro)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--gy-ink-faint)",
        }}
      >
        mentions
      </span>
      {mentions.map((s) => (
        // A real <button> here would be a <button> nested inside the feed
        // card's own <button> (invalid HTML — React warns, and browsers
        // reparent nested buttons unpredictably). role="button" on a span is
        // the same pattern already used for the like control below.
        <span
          key={s.id}
          role="button"
          tabIndex={0}
          onClick={(e) => {
            // Without this, a click on the pill also fires the feed card's
            // own onClick and opens the post AND the startup at once.
            e.stopPropagation();
            onOpen(s);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onOpen(s);
            }
          }}
          aria-label={`Open ${s.name} in the trash`}
          style={{
            display: "inline-flex",
            padding: "1px var(--gy-s-3)",
            fontFamily: "var(--gy-font-mono)",
            fontSize: "var(--gy-t-micro)",
            color: "var(--gy-mention)",
            background: "var(--gy-mention-dim)",
            borderRadius: "var(--gy-r-pill)",
            cursor: "pointer",
          }}
        >
          @{s.name}
        </span>
      ))}
    </div>
  );
}

/** Top-right account control, shown only once someone is signed in: the
    handle plus a sign-out menu. Signed-out visitors have no button here —
    they sign in via the inline prompts in the feed and post view instead. */
function AccountControl({ handle, onSignOut }: { handle: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${handle}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--gy-s-3)",
          padding: "var(--gy-s-2) var(--gy-s-4) var(--gy-s-2) var(--gy-s-2)",
          background: open ? "var(--gy-surface-sink)" : "transparent",
          border: "1px solid var(--gy-line)",
          borderRadius: "var(--gy-r-pill)",
          color: "var(--gy-ink)",
          cursor: "pointer",
          font: "inherit",
          fontSize: "var(--gy-t-ui)",
        }}
      >
        <Avatar handle={handle} size={22} />@{handle}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: "var(--gy-z-ctx)",
            minWidth: 140,
            padding: "var(--gy-s-2)",
            background: "var(--gy-surface)",
            border: "1px solid var(--gy-line)",
            borderRadius: "var(--gy-r-field)",
            boxShadow: "var(--gy-e-object)",
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "var(--gy-s-3) var(--gy-s-4)",
              background: "transparent",
              border: "none",
              borderRadius: "var(--gy-r-field)",
              color: "var(--gy-ink)",
              cursor: "pointer",
              font: "inherit",
              fontSize: "var(--gy-t-ui)",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function ForumWindow({
  startups,
  onOpenStartup,
}: {
  startups: FailedStartup[];
  onOpenStartup: (s: FailedStartup) => void;
}) {
  const [view, setView] = useState<View>("feed");
  const [activeId, setActiveId] = useState<string | null>(null);

  // --- session: real, from Supabase cookies (getCaller() on the server side
  // resolves the same session; this is the browser's view of it). ----------
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  // Set only when Supabase itself can't be reached — almost always missing
  // .env.local, not a real outage. Replaces the whole window with one banner
  // instead of an endless spinner or a wall of per-query error text.
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSession()
      .then((s) => {
        if (alive) setSession(s);
      })
      .catch((err) => {
        if (alive) setConfigError(errMessage(err, "could not reach Supabase"));
      })
      .finally(() => {
        if (alive) setSessionReady(true);
      });
    const unsubscribe = onSessionChange((s) => setSession(s));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // --- feed -----------------------------------------------------------
  const [feed, setFeed] = useState<Loadable<FeedPost[]>>({ kind: "loading" });

  const loadFeed = useCallback(() => {
    // No synchronous reset to "loading" here on purpose: the initial state is
    // already "loading", and a refetch (e.g. after signing in, to pick up
    // likedByMe) is nicer as stale-while-revalidate than a flash back to a
    // loading screen over a list that was already on screen.
    fetchFeed(session?.userId ?? null)
      .then((posts) => setFeed({ kind: "ready", value: posts }))
      .catch((err) => setFeed({ kind: "error", message: errMessage(err, "could not load the forum") }));
  }, [session?.userId]);

  useEffect(() => {
    // sessionReady/configError only need to gate the FIRST load; loadFeed
    // itself already changes identity (and re-runs this) whenever the
    // session's userId changes, which is what re-fetches likedByMe on
    // sign-in/out.
    if (!sessionReady || configError) return;
    loadFeed();
  }, [sessionReady, configError, loadFeed]);

  // --- one post, opened from the feed ----------------------------------
  const [detail, setDetail] = useState<Loadable<PostDetail>>({ kind: "loading" });

  useEffect(() => {
    if (view !== "post" || !activeId || configError) return;
    let alive = true;
    fetchPostDetail(activeId, session?.userId ?? null)
      .then((post) => {
        if (alive) setDetail({ kind: "ready", value: post });
      })
      .catch((err) => {
        if (alive) setDetail({ kind: "error", message: errMessage(err, "could not load that post") });
      });

    const unsubscribe = subscribeToComments(activeId, (comment) => {
      setDetail((prev) => {
        if (prev.kind !== "ready" || prev.value.id !== activeId) return prev;
        // A comment I just posted myself arrives here too, via the same
        // subscription — drop the echo instead of showing it twice.
        if (prev.value.comments.some((c) => c.id === comment.id)) return prev;
        return {
          kind: "ready",
          value: { ...prev.value, comments: [...prev.value.comments, comment], commentCount: prev.value.commentCount + 1 },
        };
      });
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [view, activeId, session?.userId, configError]);

  // --- compose / comment / auth form state -----------------------------
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<unknown>(null);

  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<unknown>(null);

  const [authHandle, setAuthHandle] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<unknown>(null);

  function resetAuthForm() {
    setAuthHandle("");
    setAuthEmail("");
    setAuthPassword("");
    setAuthError(null);
  }

  function openPost(id: string) {
    setActiveId(id);
    setView("post");
    setReplyTo(null);
    setCommentDraft("");
    setCommentError(null);
    // Reset here, in the click handler — not in the loading effect below,
    // which isn't allowed to set state synchronously. Without this, opening
    // a second post while the first is still in `detail` state would show
    // the previous post's title/body for a moment before the fetch resolves.
    setDetail({ kind: "loading" });
  }

  // --- likes: the server response is the only source of truth for the new
  // count, so unlike a local optimistic toggle there is nothing to
  // double-apply — see the fix note this replaced in git history. ----------
  const likeInFlight = useRef(new Set<string>());
  async function handleToggleLike(postId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!session) {
      setView("signin");
      return;
    }
    if (likeInFlight.current.has(postId)) return;
    likeInFlight.current.add(postId);
    try {
      const { liked, count } = await toggleLike("post", postId);
      setFeed((f) =>
        f.kind === "ready"
          ? { ...f, value: f.value.map((p) => (p.id === postId ? { ...p, likedByMe: liked, likeCount: count } : p)) }
          : f,
      );
      setDetail((d) =>
        d.kind === "ready" && d.value.id === postId ? { ...d, value: { ...d.value, likedByMe: liked, likeCount: count } } : d,
      );
    } catch (err) {
      console.error("like failed:", err);
    } finally {
      likeInFlight.current.delete(postId);
    }
  }

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !newTitle.trim() || !newBody.trim() || composeBusy) return;
    setComposeError(null);
    setComposeBusy(true);
    try {
      const created = await createPost(newTitle.trim(), newBody.trim());
      // The route returns the raw row — no joined handle, no matches (those
      // need a live similarity search, forum-spec.md §5 step 6). Mentions the
      // route DOES resolve synchronously before responding (step 5), so
      // rather than wait for a reload, recompute them the same way it did —
      // see resolveMentionIdsFromText's doc comment.
      const feedPost: FeedPost = {
        ...created,
        authorHandle: session.handle,
        commentCount: 0,
        likeCount: 0,
        likedByMe: false,
        mentionIds: resolveMentionIdsFromText(`${created.title} ${created.body}`, startups),
      };
      setFeed((f) => (f.kind === "ready" ? { ...f, value: [feedPost, ...f.value] } : f));
      setNewTitle("");
      setNewBody("");
    } catch (err) {
      setComposeError(err);
    } finally {
      setComposeBusy(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!session || detail.kind !== "ready" || !commentDraft.trim() || commentBusy) return;
    setCommentError(null);
    setCommentBusy(true);
    try {
      const created = await createComment(detail.value.id, replyTo, commentDraft.trim());
      const comment: DetailComment = { ...created, authorHandle: session.handle };
      setDetail((d) =>
        d.kind === "ready"
          ? { ...d, value: { ...d.value, comments: [...d.value.comments, comment], commentCount: d.value.commentCount + 1 } }
          : d,
      );
      setCommentDraft("");
      setReplyTo(null);
    } catch (err) {
      setCommentError(err);
    } finally {
      setCommentBusy(false);
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    // Same validation the server runs (lib/forum/handle.ts, forum-reads.md),
    // so a rejection here is a rejection there too.
    if (!isValidHandle(authHandle)) {
      setAuthError(new Error("handle must be 3-20 characters, lowercase letters, digits or underscore"));
      return;
    }
    if (!authEmail.includes("@")) {
      setAuthError(new Error("a valid email is required"));
      return;
    }
    if (authPassword.length < 8) {
      setAuthError(new Error("password must be at least 8 characters"));
      return;
    }
    setAuthBusy(true);
    try {
      const s = await registerAccount(authHandle, authEmail, authPassword);
      setSession(s);
      resetAuthForm();
      setView("feed");
    } catch (err) {
      setAuthError(err);
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitSignin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (!authEmail.includes("@") || authPassword.length === 0) {
      setAuthError(new Error("enter your email and password"));
      return;
    }
    setAuthBusy(true);
    try {
      const s = await login(authEmail, authPassword);
      setSession(s);
      resetAuthForm();
      setView("feed");
    } catch (err) {
      setAuthError(err);
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    try {
      await logout();
    } catch (err) {
      console.error("logout failed:", err);
    }
    setSession(null);
  }

  if (configError) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--gy-s-4)",
          padding: "var(--gy-s-6)",
          background: "var(--gy-surface-sink)",
          border: "1px solid var(--gy-line-soft)",
          borderRadius: "var(--gy-r-field)",
        }}
      >
        <span style={{ fontSize: "var(--gy-t-ui)", fontWeight: 600, color: "var(--gy-ink)" }}>
          Forum isn&apos;t connected yet.
        </span>
        <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-dim)", lineHeight: 1.5 }}>
          This almost always means <code>.env.local</code> is missing
          <code> NEXT_PUBLIC_SUPABASE_URL</code> / <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> — see{" "}
          <code>.env.example</code>. The raw error, for whoever&apos;s debugging it:
        </p>
        <code style={{ fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-meta)", color: "var(--gy-dead)" }}>
          {configError}
        </code>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-7)", height: "100%" }}>
      {/* ---- top row: back (in a post) or the forum eyebrow, plus account ---- */}
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {view === "post" ? (
          <button
            onClick={() => setView("feed")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--gy-s-2)",
              padding: 0,
              background: "transparent",
              border: "none",
              color: "var(--gy-ink-dim)",
              cursor: "pointer",
              font: "inherit",
              fontSize: "var(--gy-t-ui)",
            }}
          >
            <BackGlyph /> Forum
          </button>
        ) : (
          <span
            style={{
              fontSize: "var(--gy-t-micro)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--gy-ink-faint)",
            }}
          >
            {view === "feed" ? "The forum" : view === "signin" ? "Sign in" : "Create an account"}
          </span>
        )}

        {/* Signed-out visitors get exactly one way in: the "sign in to
            start/comment" prompts inline in the feed and post view. A second
            entry point up here would be redundant chrome. */}
        {session && view !== "signin" && view !== "signup" && (
          <AccountControl handle={session.handle} onSignOut={signOut} />
        )}
      </div>

      {/* ---- feed ---- */}
      {view === "feed" && (
        <>
          {session ? (
            <form
              onSubmit={submitPost}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--gy-s-4)",
                padding: "var(--gy-s-6)",
                background: "var(--gy-surface-sink)",
                border: "1px solid var(--gy-line-soft)",
                borderRadius: "var(--gy-r-field)",
              }}
            >
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What's the idea?"
                maxLength={200}
                style={inputStyle}
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Say more — mention a dead company with @handle if you know one."
                rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--gy-font-ui)" }}
              />
              {composeError !== null && (
                <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: errColor(composeError) }}>
                  {errMessage(composeError, "could not create the post")}
                </p>
              )}
              <button
                type="submit"
                disabled={!newTitle.trim() || !newBody.trim() || composeBusy}
                style={{
                  ...buttonStyle,
                  alignSelf: "flex-end",
                  opacity: !newTitle.trim() || !newBody.trim() || composeBusy ? 0.5 : 1,
                }}
              >
                {composeBusy ? "Posting…" : "Post"}
              </button>
            </form>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--gy-s-5)",
                padding: "var(--gy-s-6)",
                background: "var(--gy-surface-sink)",
                border: "1px dashed var(--gy-line)",
                borderRadius: "var(--gy-r-field)",
              }}
            >
              <span style={{ fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-dim)" }}>
                Sign in to start a thread.
              </span>
              <button onClick={() => { resetAuthForm(); setView("signin"); }} style={ghostButtonStyle}>
                Sign in
              </button>
            </div>
          )}

          {feed.kind === "loading" && (
            <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>Loading the forum…</p>
          )}
          {feed.kind === "error" && (
            <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-dead)" }}>{feed.message}</p>
          )}

          {/* Chat-list layout: avatar fixed on the far left, everything else
              stacked in a column beside it — title + time on the top line,
              preview + like/comment badges on the bottom line, the way a
              WhatsApp row pairs a contact photo with name-and-last-message. */}
          {feed.kind === "ready" && (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {feed.value.length === 0 && (
                <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>
                  No threads yet — be the first.
                </p>
              )}
              {feed.value.map((p) => {
                const mentions = resolveMentions(p.mentionIds, startups);
                return (
                  <li key={p.id} style={{ borderBottom: "1px solid var(--gy-line-soft)" }}>
                    <button
                      onClick={() => openPost(p.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "var(--gy-s-5)",
                        padding: "var(--gy-s-5) var(--gy-s-2)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                      }}
                    >
                      <Avatar handle={p.authorHandle} size={44} />
                      <span style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-2)", flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--gy-s-4)" }}>
                          <span
                            style={{
                              fontSize: "var(--gy-t-lead)",
                              fontWeight: 600,
                              color: "var(--gy-ink)",
                              lineHeight: 1.3,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.title}
                          </span>
                          <span
                            style={{
                              flex: "0 0 auto",
                              fontFamily: "var(--gy-font-mono)",
                              fontSize: "var(--gy-t-micro)",
                              color: "var(--gy-ink-faint)",
                            }}
                          >
                            {timeAgo(p.created_at)}
                          </span>
                        </span>

                        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--gy-s-4)" }}>
                          <span
                            style={{
                              fontSize: "var(--gy-t-body)",
                              color: "var(--gy-ink-dim)",
                              lineHeight: 1.4,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                          >
                            <span style={{ fontFamily: "var(--gy-font-mono)", color: "var(--gy-ink-faint)" }}>@{p.authorHandle}:</span>{" "}
                            {stripResolvedMentionTokens(p.body, mentions.map((s) => s.name))}
                          </span>
                          <span style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "var(--gy-s-4)" }}>
                            <span
                              onClick={(e) => handleToggleLike(p.id, e)}
                              role="button"
                              tabIndex={0}
                              aria-label={p.likedByMe ? "Unlike" : "Like"}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "var(--gy-s-2)",
                                color: p.likedByMe ? "var(--gy-dead)" : "var(--gy-ink-faint)",
                                fontSize: "var(--gy-t-meta)",
                                fontFamily: "var(--gy-font-mono)",
                                cursor: "pointer",
                              }}
                            >
                              <HeartGlyph active={p.likedByMe} /> {p.likeCount}
                            </span>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "var(--gy-s-2)",
                                color: "var(--gy-ink-faint)",
                                fontSize: "var(--gy-t-meta)",
                                fontFamily: "var(--gy-font-mono)",
                              }}
                            >
                              <BubbleGlyph /> {p.commentCount}
                            </span>
                          </span>
                        </span>

                        <MentionRow mentions={mentions} onOpen={onOpenStartup} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* ---- one post, big header + subheading, comments below ---- */}
      {view === "post" && (
        <>
          {detail.kind === "loading" && (
            <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>Loading…</p>
          )}
          {detail.kind === "error" && (
            <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-dead)" }}>{detail.message}</p>
          )}
          {detail.kind === "ready" && (() => {
            const post = detail.value;
            const mentions = resolveMentions(post.mentionIds, startups);
            return (
              <article style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-7)" }}>
                <header style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-3)" }}>
                  <h1
                    style={{
                      margin: 0,
                      fontFamily: "var(--gy-font-display)",
                      fontWeight: 400,
                      fontSize: "var(--gy-t-epitaph)",
                      lineHeight: 1.08,
                      color: "var(--gy-ink)",
                    }}
                  >
                    {post.title}
                  </h1>
                  <p style={{ margin: 0, fontSize: "var(--gy-t-lead)", color: "var(--gy-ink-dim)", lineHeight: 1.5 }}>
                    {stripResolvedMentionTokens(post.body, mentions.map((s) => s.name))}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--gy-s-5)",
                      fontFamily: "var(--gy-font-mono)",
                      fontSize: "var(--gy-t-meta)",
                      color: "var(--gy-ink-faint)",
                      paddingTop: "var(--gy-s-2)",
                    }}
                  >
                    <span>@{post.authorHandle}</span>
                    <span>{timeAgo(post.created_at)}</span>
                  </div>
                  <MentionRow mentions={mentions} onOpen={onOpenStartup} />
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--gy-s-6)", paddingTop: "var(--gy-s-2)" }}>
                    <button
                      onClick={() => handleToggleLike(post.id)}
                      aria-label={post.likedByMe ? "Unlike" : "Like"}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--gy-s-2)",
                        padding: "var(--gy-s-2) var(--gy-s-4)",
                        background: post.likedByMe ? "var(--gy-dead-dim)" : "transparent",
                        border: "1px solid var(--gy-line)",
                        borderRadius: "var(--gy-r-pill)",
                        color: post.likedByMe ? "var(--gy-dead)" : "var(--gy-ink-dim)",
                        fontSize: "var(--gy-t-ui)",
                        cursor: "pointer",
                      }}
                    >
                      <HeartGlyph active={post.likedByMe} /> {post.likeCount}
                    </button>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--gy-s-2)", color: "var(--gy-ink-faint)", fontSize: "var(--gy-t-ui)" }}>
                      <BubbleGlyph /> {post.commentCount} comments
                    </span>
                  </div>
                </header>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-6)" }}>
                  {post.comments
                    .filter((c) => c.parent_id === null)
                    .map((c) => (
                      <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-4)" }}>
                        <CommentRow comment={c} onReply={() => { setReplyTo(c.id); setCommentDraft(""); }} />
                        {post.comments
                          .filter((r) => r.parent_id === c.id)
                          .map((r) => (
                            <div key={r.id} style={{ marginLeft: "var(--gy-s-9)", borderLeft: "2px solid var(--gy-live-dim)", paddingLeft: "var(--gy-s-5)" }}>
                              <CommentRow comment={r} />
                            </div>
                          ))}
                      </div>
                    ))}
                  {post.comments.length === 0 && (
                    <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>No comments yet.</p>
                  )}
                </div>

                {session ? (
                  <form onSubmit={submitComment} style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-3)" }}>
                    {replyTo && (
                      <span style={{ display: "flex", alignItems: "center", gap: "var(--gy-s-3)", fontSize: "var(--gy-t-meta)", color: "var(--gy-ink-faint)" }}>
                        Replying to a comment
                        <button
                          type="button"
                          onClick={() => setReplyTo(null)}
                          style={{ background: "none", border: "none", color: "var(--gy-live)", cursor: "pointer", font: "inherit" }}
                        >
                          cancel
                        </button>
                      </span>
                    )}
                    {commentError !== null && (
                      <p style={{ margin: 0, fontSize: "var(--gy-t-meta)", color: errColor(commentError) }}>
                        {errMessage(commentError, "could not post the comment")}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: "var(--gy-s-4)" }}>
                      <input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder={replyTo ? "Write a reply" : "Add a comment"}
                        style={inputStyle}
                      />
                      <button
                        type="submit"
                        disabled={!commentDraft.trim() || commentBusy}
                        style={{ ...buttonStyle, opacity: commentDraft.trim() && !commentBusy ? 1 : 0.5 }}
                      >
                        {commentBusy ? "…" : "Reply"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <span style={{ fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>
                    <button onClick={() => { resetAuthForm(); setView("signin"); }} style={{ background: "none", border: "none", padding: 0, color: "var(--gy-ground)", cursor: "pointer", font: "inherit" }}>
                      Sign in
                    </button>{" "}
                    to comment.
                  </span>
                )}
              </article>
            );
          })()}
        </>
      )}

      {/* ---- sign in / sign up, centred in whatever space is left below the
             top row ---- */}
      {(view === "signin" || view === "signup") && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <form
          onSubmit={view === "signin" ? submitSignin : submitSignup}
          style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-5)", width: 300 }}
        >
          {view === "signup" && (
            <label style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-2)" }}>
              <span style={{ fontSize: "var(--gy-t-micro)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gy-ink-faint)" }}>
                Handle
              </span>
              <input
                value={authHandle}
                onChange={(e) => setAuthHandle(e.target.value)}
                placeholder="lowercase, 3-20 chars"
                autoCapitalize="off"
                style={inputStyle}
              />
            </label>
          )}
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-2)" }}>
            <span style={{ fontSize: "var(--gy-t-micro)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gy-ink-faint)" }}>
              Email
            </span>
            <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-2)" }}>
            <span style={{ fontSize: "var(--gy-t-micro)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gy-ink-faint)" }}>
              Password
            </span>
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} style={inputStyle} />
          </label>

          {authError !== null && (
            <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: errColor(authError) }}>
              {errMessage(authError, view === "signin" ? "could not sign in" : "could not create the account")}
            </p>
          )}

          <button type="submit" disabled={authBusy} style={{ ...buttonStyle, opacity: authBusy ? 0.6 : 1 }}>
            {authBusy ? "…" : view === "signin" ? "Sign in" : "Create account"}
          </button>

          <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>
            {view === "signin" ? "Need an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => { resetAuthForm(); setView(view === "signin" ? "signup" : "signin"); }}
              style={{ background: "none", border: "none", padding: 0, color: "var(--gy-ground)", cursor: "pointer", font: "inherit" }}
            >
              {view === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
          <button
            type="button"
            onClick={() => setView("feed")}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: "var(--gy-s-2)",
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--gy-ink-faint)",
              cursor: "pointer",
              font: "inherit",
              fontSize: "var(--gy-t-meta)",
            }}
          >
            <BackGlyph size={11} /> Back to the forum
          </button>
        </form>
        </div>
      )}
    </div>
  );
}

function CommentRow({ comment, onReply }: { comment: DetailComment; onReply?: () => void }) {
  return (
    <div style={{ display: "flex", gap: "var(--gy-s-4)" }}>
      <Avatar handle={comment.authorHandle} />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-1)", flex: 1 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--gy-s-3)", fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-meta)", color: "var(--gy-ink-faint)" }}>
          @{comment.authorHandle} · {timeAgo(comment.created_at)}
        </span>
        <p style={{ margin: 0, fontSize: "var(--gy-t-body)", color: "var(--gy-ink)", lineHeight: 1.5 }}>{comment.body}</p>
        {onReply && (
          <button
            onClick={onReply}
            style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "var(--gy-ink-faint)", cursor: "pointer", font: "inherit", fontSize: "var(--gy-t-meta)" }}
          >
            Reply
          </button>
        )}
      </div>
    </div>
  );
}
