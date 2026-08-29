"use client";

/* ==========================================================================
   FORUM — Sam's canvas.
   --------------------------------------------------------------------------
   PLACEHOLDER MOCKUP. All state below is local (useState over
   forum-mock-data.ts) — nothing here calls Supabase or /api/forum/*, /api/auth/*
   yet, so this renders and is fully clickable with no .env at all. The real
   backend already exists (Yeriel's, merged from feat/api-backend: auth +
   forum route handlers, Supabase schema, lib/forum/*, lib/types.ts Profile /
   ForumPost / ForumComment) and the exact contract is documented in
   docs/forum-reads.md. Wiring it up is a small follow-up, not a rewrite —
   every place that fakes a write is marked with a TODO naming the real call.

   Layout: one view switch inside this single window (feed / a post / sign in
   / sign up). Big header = post title, subheading = post body, same
   treatment StartupWindow gives a dead company's name and tagline. The
   account icon lives top-right of the window's own content, since Window.tsx
   / Desktop.tsx are Darryl's finished chrome and out of scope here.
   ========================================================================== */

import { useMemo, useState } from "react";
import { isValidHandle } from "@/lib/forum/handle";
import { BackGlyph, BubbleGlyph, HeartGlyph } from "./ForumGlyphs";
import {
  MOCK_COMMENTS,
  MOCK_LIKES,
  MOCK_POSTS,
  stripMentions,
  timeAgo,
  type MockComment,
  type MockPost,
} from "./forum-mock-data";

type View = "feed" | "post" | "signin" | "signup";

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
 * who wrote the post; this rust-coloured pill, only present when the body
 * actually mentions a company, links out to the graveyard. See "Rendering
 * @mentions" in docs/forum-reads.md.
 */
function MentionRow({ mentions }: { mentions: string[] }) {
  if (mentions.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--gy-s-3)" }}>
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
      {mentions.map((m) => (
        <span
          key={m}
          style={{
            display: "inline-flex",
            padding: "1px var(--gy-s-3)",
            fontFamily: "var(--gy-font-mono)",
            fontSize: "var(--gy-t-micro)",
            color: "var(--gy-mention)",
            background: "var(--gy-mention-dim)",
            borderRadius: "var(--gy-r-pill)",
          }}
        >
          {m}
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

export default function ForumWindow() {
  const [view, setView] = useState<View>("feed");
  const [activeId, setActiveId] = useState<string | null>(null);

  // --- mock session -------------------------------------------------------
  // TODO real version: session comes from Supabase cookies (lib/forum/session.ts),
  // not local state. Reads (posts, comments) then go browser -> Supabase
  // directly per docs/forum-reads.md; only writes hit route handlers.
  const [handle, setHandle] = useState<string | null>(null);

  // --- mock data, mutable locally so the mockup is actually clickable -----
  const [posts, setPosts] = useState<MockPost[]>(MOCK_POSTS);
  const [comments, setComments] = useState<MockComment[]>(MOCK_COMMENTS);
  const [likes, setLikes] = useState<Record<string, number>>(MOCK_LIKES);
  const [likedByMe, setLikedByMe] = useState<Set<string>>(new Set());

  // --- compose state --------------------------------------------------
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  // --- auth form state ------------------------------------------------
  const [authHandle, setAuthHandle] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const activePost = useMemo(() => posts.find((p) => p.id === activeId) ?? null, [posts, activeId]);
  const commentsFor = (postId: string) => comments.filter((c) => c.postId === postId);

  function openPost(id: string) {
    setActiveId(id);
    setView("post");
    setReplyTo(null);
    setCommentDraft("");
  }

  function toggleLike(postId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    // TODO real version: POST /api/forum/like {targetType:"post", targetId},
    // returns {liked, count} — this optimistic toggle is what that response
    // replaces, not what triggers it.
    //
    // The two setState calls stay siblings, not nested. Calling setLikes
    // *inside* setLikedByMe's updater was the cause of the double-counting
    // bug: React 18's dev server (Strict Mode, on by default for the App
    // Router) invokes a state updater function twice to check it's pure, and
    // discards one result — harmless when the updater only reads its own
    // `prev`, but a setLikes call nested inside it fired on both
    // invocations, so every click applied the like twice.
    const wasLiked = likedByMe.has(postId);
    setLikedByMe((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(postId);
      else next.add(postId);
      return next;
    });
    setLikes((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + (wasLiked ? -1 : 1) }));
  }

  function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!handle || !newTitle.trim() || !newBody.trim()) return;
    // TODO real version: POST /api/forum/posts {title, body} -> 201 with the
    // created row; 429 needs its own "rate limited" state per forum-reads.md.
    const id = `p${Date.now()}`;
    const mentions = Array.from(newBody.matchAll(/@[a-z0-9]+/gi)).map((m) => m[0].toLowerCase());
    setPosts((ps) => [
      { id, author: handle, title: newTitle.trim(), body: newBody.trim(), createdAt: new Date().toISOString(), mentions },
      ...ps,
    ]);
    setLikes((ls) => ({ ...ls, [id]: 0 }));
    setNewTitle("");
    setNewBody("");
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!handle || !activePost || !commentDraft.trim()) return;
    // TODO real version: POST /api/forum/comments {postId, parentId?, body}.
    setComments((cs) => [
      ...cs,
      {
        id: `c${Date.now()}`,
        postId: activePost.id,
        parentId: replyTo,
        author: handle,
        body: commentDraft.trim(),
        createdAt: new Date().toISOString(),
      },
    ]);
    setCommentDraft("");
    setReplyTo(null);
  }

  function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    // Same validation the server runs (lib/forum/handle.ts, forum-reads.md),
    // so a rejection here is a rejection there too.
    if (!isValidHandle(authHandle)) {
      setAuthError("handle must be 3-20 characters, lowercase letters, digits or underscore");
      return;
    }
    if (!authEmail.includes("@")) {
      setAuthError("a valid email is required");
      return;
    }
    if (authPassword.length < 8) {
      setAuthError("password must be at least 8 characters");
      return;
    }
    // TODO real version: POST /api/auth/register {handle, email, password} ->
    // 201 {userId, handle}, or 409 "that handle is taken" / "that email
    // already has an account" — surface those verbatim on the field.
    setHandle(authHandle);
    resetAuthForm();
    setView("feed");
  }

  function submitSignin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (!authEmail.includes("@") || authPassword.length === 0) {
      setAuthError("enter your email and password");
      return;
    }
    // TODO real version: POST /api/auth/login {email, password}, sets sb-
    // cookies; a mock session has no real profile row, so it stands in with
    // the email's local part as the handle shown in the UI.
    setHandle(authEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") || "founder");
    resetAuthForm();
    setView("feed");
  }

  function resetAuthForm() {
    setAuthHandle("");
    setAuthEmail("");
    setAuthPassword("");
    setAuthError(null);
  }

  function signOut() {
    // TODO real version: POST /api/auth/logout.
    setHandle(null);
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
        {handle && view !== "signin" && view !== "signup" && (
          <AccountControl handle={handle} onSignOut={signOut} />
        )}
      </div>

      {/* ---- feed ---- */}
      {view === "feed" && (
        <>
          {handle ? (
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
                maxLength={140}
                style={inputStyle}
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Say more — mention a dead company with @handle if you know one."
                rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--gy-font-ui)" }}
              />
              <button
                type="submit"
                disabled={!newTitle.trim() || !newBody.trim()}
                style={{ ...buttonStyle, alignSelf: "flex-end", opacity: !newTitle.trim() || !newBody.trim() ? 0.5 : 1 }}
              >
                Post
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

          {/* Chat-list layout: avatar fixed on the far left, everything else
              stacked in a column beside it — title + time on the top line,
              preview + like/comment badges on the bottom line, the way a
              WhatsApp row pairs a contact photo with name-and-last-message. */}
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {posts.map((p) => {
              const count = commentsFor(p.id).length;
              const liked = likedByMe.has(p.id);
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
                    <Avatar handle={p.author} size={44} />
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
                          {timeAgo(p.createdAt)}
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
                          <span style={{ fontFamily: "var(--gy-font-mono)", color: "var(--gy-ink-faint)" }}>@{p.author}:</span>{" "}
                          {stripMentions(p.body, p.mentions)}
                        </span>
                        <span style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "var(--gy-s-4)" }}>
                          <span
                            onClick={(e) => toggleLike(p.id, e)}
                            role="button"
                            tabIndex={0}
                            aria-label={liked ? "Unlike" : "Like"}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "var(--gy-s-2)",
                              color: liked ? "var(--gy-dead)" : "var(--gy-ink-faint)",
                              fontSize: "var(--gy-t-meta)",
                              fontFamily: "var(--gy-font-mono)",
                              cursor: "pointer",
                            }}
                          >
                            <HeartGlyph active={liked} /> {likes[p.id] ?? 0}
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
                            <BubbleGlyph /> {count}
                          </span>
                        </span>
                      </span>

                      {p.mentions.length > 0 && <MentionRow mentions={p.mentions} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* ---- one post, big header + subheading, comments below ---- */}
      {view === "post" && activePost && (
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
              {activePost.title}
            </h1>
            <p style={{ margin: 0, fontSize: "var(--gy-t-lead)", color: "var(--gy-ink-dim)", lineHeight: 1.5 }}>
              {stripMentions(activePost.body, activePost.mentions)}
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
              <span>@{activePost.author}</span>
              <span>{timeAgo(activePost.createdAt)}</span>
            </div>
            <MentionRow mentions={activePost.mentions} />
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gy-s-6)", paddingTop: "var(--gy-s-2)" }}>
              <button
                onClick={() => toggleLike(activePost.id)}
                aria-label={likedByMe.has(activePost.id) ? "Unlike" : "Like"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--gy-s-2)",
                  padding: "var(--gy-s-2) var(--gy-s-4)",
                  background: likedByMe.has(activePost.id) ? "var(--gy-dead-dim)" : "transparent",
                  border: "1px solid var(--gy-line)",
                  borderRadius: "var(--gy-r-pill)",
                  color: likedByMe.has(activePost.id) ? "var(--gy-dead)" : "var(--gy-ink-dim)",
                  fontSize: "var(--gy-t-ui)",
                  cursor: "pointer",
                }}
              >
                <HeartGlyph active={likedByMe.has(activePost.id)} /> {likes[activePost.id] ?? 0}
              </button>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--gy-s-2)", color: "var(--gy-ink-faint)", fontSize: "var(--gy-t-ui)" }}>
                <BubbleGlyph /> {commentsFor(activePost.id).length} comments
              </span>
            </div>
          </header>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-6)" }}>
            {commentsFor(activePost.id)
              .filter((c) => c.parentId === null)
              .map((c) => (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-4)" }}>
                  <CommentRow comment={c} onReply={() => { setReplyTo(c.id); setCommentDraft(""); }} />
                  {commentsFor(activePost.id)
                    .filter((r) => r.parentId === c.id)
                    .map((r) => (
                      <div key={r.id} style={{ marginLeft: "var(--gy-s-9)", borderLeft: "2px solid var(--gy-live-dim)", paddingLeft: "var(--gy-s-5)" }}>
                        <CommentRow comment={r} />
                      </div>
                    ))}
                </div>
              ))}
            {commentsFor(activePost.id).length === 0 && (
              <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>No comments yet.</p>
            )}
          </div>

          {handle ? (
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
              <div style={{ display: "flex", gap: "var(--gy-s-4)" }}>
                <input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder={replyTo ? "Write a reply" : "Add a comment"}
                  style={inputStyle}
                />
                <button type="submit" disabled={!commentDraft.trim()} style={{ ...buttonStyle, opacity: commentDraft.trim() ? 1 : 0.5 }}>
                  Reply
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

          {authError && <p style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-dead)" }}>{authError}</p>}

          <button type="submit" style={buttonStyle}>
            {view === "signin" ? "Sign in" : "Create account"}
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

function CommentRow({ comment, onReply }: { comment: MockComment; onReply?: () => void }) {
  return (
    <div style={{ display: "flex", gap: "var(--gy-s-4)" }}>
      <Avatar handle={comment.author} />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-1)", flex: 1 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--gy-s-3)", fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-meta)", color: "var(--gy-ink-faint)" }}>
          @{comment.author} · {timeAgo(comment.createdAt)}
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
