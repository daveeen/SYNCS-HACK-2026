/**
 * POST /api/auth/register — create an account. Owner: Yeriel.
 *
 * Email confirmation is OFF (forum-spec.md §2), so the account is usable
 * immediately. Two consequences that are decisions, not oversights: there is no
 * account recovery, and nothing proves the email belongs to anyone. Email is a
 * login identifier here, not a contact channel.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidHandle } from "@/lib/forum/handle";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 10;

type RegisterRequest = { handle?: string; email?: string; password?: string };

export async function POST(
  request: Request,
): Promise<NextResponse<{ userId: string; handle: string } | ApiError>> {
  let body: RegisterRequest;
  try {
    body = (await request.json()) as RegisterRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const handle = typeof body.handle === "string" ? body.handle.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidHandle(handle)) {
    return NextResponse.json(
      { error: "handle must be 3-20 characters, lowercase letters, digits or underscore" },
      { status: 400 },
    );
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "a valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // The trigger in supabase/schema.sql reads this to create the profile row.
    options: { data: { handle } },
  });

  if (error) {
    // Always log the real thing. Collapsing every failure into one generic 500
    // is how a misconfigured project looks like a code bug for an hour.
    console.error(
      `register: signUp failed [${error.code ?? "no-code"} / ${error.status ?? "no-status"}]:`,
      error.message,
    );

    // A duplicate handle surfaces as a Postgres 23505 raised inside the trigger,
    // which Supabase reports as a signup failure. Map it to something a person
    // can act on rather than leaking a constraint name.
    // GoTrue does NOT pass the Postgres error through. Any exception raised
    // inside the signup trigger — including the unique violation on
    // profiles.handle — is collapsed into the opaque "Database error saving new
    // user" / unexpected_failure. Matching only on 23505 or the constraint name
    // means this branch never fires and a taken handle returns a bare 500.
    //
    // The trigger is the only thing that can fail in that transaction, and a
    // duplicate handle is by far its likeliest failure, so we check the handle
    // ourselves to say something true rather than guessing from the message.
    const looksLikeTriggerFailure =
      error.message.includes("profiles_handle_key") ||
      error.message.includes("23505") ||
      error.message.toLowerCase().includes("database error saving new user") ||
      error.code === "unexpected_failure";

    if (looksLikeTriggerFailure) {
      const { data: taken } = await supabase
        .from("profiles")
        .select("handle")
        .eq("handle", handle)
        .maybeSingle();

      if (taken) {
        return NextResponse.json({ error: "that handle is taken" }, { status: 409 });
      }
      return NextResponse.json({ error: "could not create the account" }, { status: 500 });
    }

    if (error.message.toLowerCase().includes("already registered")) {
      return NextResponse.json({ error: "that email already has an account" }, { status: 409 });
    }

    // Supabase is rate-limiting its own confirmation emails. This only happens
    // when "Confirm email" is still ON in the dashboard — with it off, signup
    // sends no mail and cannot hit this at all. Surfacing it as a 500 sends
    // whoever sees it hunting through route code for a bug that is a project
    // setting.
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return NextResponse.json(
        {
          error:
            "signup is temporarily rate limited by the auth provider — if this persists, " +
            "email confirmation is still enabled and should be turned off",
        },
        { status: 429 },
      );
    }

    if (error.message.toLowerCase().includes("password")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "could not create the account" }, { status: 500 });
  }

  if (!data.user) {
    return NextResponse.json({ error: "could not create the account" }, { status: 500 });
  }

  return NextResponse.json({ userId: data.user.id, handle }, { status: 201 });
}
