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
