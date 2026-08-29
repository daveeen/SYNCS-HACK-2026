/**
 * POST /api/auth/logout — end the session. Owner: Yeriel.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(): Promise<NextResponse<{ ok: true } | ApiError>> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("logout: signOut failed:", error.message);
    return NextResponse.json({ error: "could not sign out" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
