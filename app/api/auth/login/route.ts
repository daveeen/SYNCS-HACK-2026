/**
 * POST /api/auth/login — exchange credentials for a session. Owner: Yeriel.
 *
 * @supabase/ssr writes the session cookies through the client created in
 * lib/supabase/server.ts. Nothing custom, no token handling here.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 10;

type LoginRequest = { email?: string; password?: string };

export async function POST(
  request: Request,
): Promise<NextResponse<{ userId: string } | ApiError>> {
  let body: LoginRequest;
  try {
    body = (await request.json()) as LoginRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // One message for both "no such email" and "wrong password", on purpose.
    // Distinguishing them tells an attacker which emails are registered.
    return NextResponse.json({ error: "email or password is incorrect" }, { status: 401 });
  }

  return NextResponse.json({ userId: data.user.id });
}
