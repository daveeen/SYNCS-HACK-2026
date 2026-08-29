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
