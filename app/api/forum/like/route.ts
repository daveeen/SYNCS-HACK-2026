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
import { isUuid } from "@/lib/forum/ids";
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
  if (!isUuid(targetId)) {
    return NextResponse.json({ error: "targetId must be a uuid" }, { status: 400 });
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
    // 23505 means a concurrent request inserted the same like between our
    // select and our insert. The row exists and belongs to this user, which is
    // exactly the state we wanted — reporting 500 would fail a request that
    // actually succeeded. The composite key makes the row idempotent; this
    // makes the RESPONSE idempotent too.
    if (error && error.code !== "23505") {
      console.error("like: insert failed:", error.message);
      return NextResponse.json({ error: "could not update the like" }, { status: 500 });
    }
    liked = true;
  }
  // count(*) rather than a counter column. Served by likes_target_idx, and it
  // cannot drift out of sync with reality the way a maintained counter can.
  const { count, error: countError } = await supabase
    .from("likes")
    .select("user_id", { count: "exact", head: true })
    .eq("target_type", targetType)
    .eq("target_id", targetId);

  // Do not report 0 on a failed count. The toggle already succeeded, and a
  // zero here would make the UI overwrite a real count with nothing.
  if (countError) {
    console.error("like: count failed:", countError.message);
    return NextResponse.json({ error: "the like was saved but the count is unavailable" }, { status: 500 });
  }

  return NextResponse.json({ liked, count: count ?? 0 });
}
