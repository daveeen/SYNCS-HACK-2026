/**
 * Supabase client bound to the CALLER'S cookies. Owner: Yeriel.
 *
 * Route handlers use this, not the admin client, so RLS stays live on every
 * write: "you can only edit your own post" is a database refusal rather than an
 * `if` someone forgets. The admin client is for derived rows only.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  // Fail with something actionable. Non-null assertions here produce a bare 500
  // on every /api/auth and /api/forum route when the env is simply missing,
  // which reads as a code bug rather than a five-second fix. lib/supabase/admin.ts
  // already does this for the service key.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. " +
        "Copy .env.example to .env.local and fill them in.",
    );
  }

  // cookies() is async in Next 16.
  const cookieStore = await cookies();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: route handlers and Server Actions can still set.
          }
        },
      },
    },
  );
}
