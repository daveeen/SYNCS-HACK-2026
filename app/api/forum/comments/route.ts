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
import { isUuid } from "@/lib/forum/ids";
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

  if (!isUuid(postId)) {
    return NextResponse.json({ error: "postId must be a uuid" }, { status: 400 });
  }
  if (parentId !== null && !isUuid(parentId)) {
    return NextResponse.json({ error: "parentId must be a uuid" }, { status: 400 });
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
  // A well-formed uuid for a post that does not exist would otherwise reach the
  // insert, trip the foreign key, and come back as a 500 — our fault, for what
  // is plainly a bad request. Deleted posts make this reachable in normal use.
  const { data: post } = await supabase.from("posts").select("id").eq("id", postId).maybeSingle();
  if (!post) {
    return NextResponse.json({ error: "that post does not exist" }, { status: 404 });
  }

  if (parentId) {
    const { data: parent } = await supabase
      .from("comments")
      .select("post_id, parent_id")
      .eq("id", parentId)
      .single();

    if (!parent || parent.post_id !== postId) {
      return NextResponse.json(
        { error: "parentId does not belong to that post" },
        { status: 400 },
      );
    }

    // ONE level of nesting. The schema cannot express this — parent_id is just a
    // self-reference, so Postgres will happily build a chain of any depth. Both
    // the schema comment and docs/forum-reads.md promise one level, and the UI
    // is built for one level; without this check the promise is only a comment.
    if (parent.parent_id !== null) {
      return NextResponse.json(
        { error: "replies can only be one level deep — reply to the top-level comment instead" },
        { status: 400 },
      );
    }
  }

  // Same reasoning as the posts route: fail closed, but shaped.
  let recent: number;
  try {
    recent = await countRecentWrites(supabase, "comment", caller.userId);
  } catch (err) {
    console.error("comments: rate limit check failed:", err);
    return NextResponse.json({ error: "could not create the comment" }, { status: 500 });
  }
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
