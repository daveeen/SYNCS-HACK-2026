/**
 * Handle validation. Owner: Yeriel.
 *
 * Pure, so it can be checked without a database.
 *
 * This regex is duplicated as a `check` constraint in supabase/schema.sql, on
 * purpose. The route validates so the user gets a readable error; the database
 * validates because the route is not the only thing that can ever insert.
 * scripts/check.ts asserts the two stay identical.
 */

/** Lowercase letters, digits and underscore. 3-20 characters. */
export const HANDLE_RULE = /^[a-z0-9_]{3,20}$/;

/**
 * Handles are lowercase ONLY, and invalid input is rejected rather than
 * silently lowercased. Quietly transforming what someone typed means they get a
 * different handle from the one they chose, which reads as a bug.
 *
 * `citext` in the schema still makes lookups case-insensitive, so nobody can
 * register `Webvan` alongside `webvan`.
 */
export function isValidHandle(handle: unknown): boolean {
  return typeof handle === "string" && HANDLE_RULE.test(handle);
}
