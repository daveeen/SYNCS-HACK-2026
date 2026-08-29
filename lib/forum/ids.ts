/**
 * Id validation. Owner: Yeriel.
 *
 * Pure, no I/O.
 *
 * Every forum route takes ids from the request body and hands them to Postgres.
 * An id that is merely non-empty but not a UUID makes Postgres raise `22P02
 * invalid input syntax for type uuid`, which the route then reports as a 500 —
 * our fault, for what is plainly a bad request. Checking the shape first turns
 * those into 400s.
 */

/** Any RFC-4122 variant, any version. We only care that Postgres will accept it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
