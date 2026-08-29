/**
 * Resolve the caller. Owner: Yeriel.
 *
 * Every forum write starts here. The returned id is the ONLY acceptable source
 * of `author_id` — reading it from the request body instead is how this class
 * of endpoint gets impersonation bugs, and it is the single most common way
 * they are introduced.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Caller = { userId: string; handle: string };

/**
 * Returns the signed-in caller, or null.
 *
 * Uses getUser(), not getSession(). getSession() reads the cookie and trusts
 * what it finds; getUser() revalidates against the auth server. On a write path
 * that difference is the whole point.
 */
export async function getCaller(): Promise<Caller | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", user.id)
    .single();

  // No profile means the signup trigger did not run. Treat it as not signed in
  // rather than inventing a caller: a user without a profile cannot own a post,
  // because posts.author_id references profiles.
  if (!profile) return null;

  return { userId: user.id, handle: profile.handle as string };
}
