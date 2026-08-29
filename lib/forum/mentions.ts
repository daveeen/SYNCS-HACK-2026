/**
 * @mention resolution. Owner: Yeriel.
 *
 * Pure — no I/O, so it is checkable without a database or a key.
 *
 * One namespace, and it is the dead startups. User mentions are not a feature;
 * `@yeriel` resolves to nothing and renders as the literal text.
 */
import type { FailedStartup } from "@/lib/types";

/**
 * `@` preceded by start-of-string or whitespace, then word characters.
 *
 * The leading boundary is what stops `yeriel@fetchly.com` matching — without
 * it, every post containing an email address links to a dead startup.
 */
const MENTION = /(^|\s)@([a-z0-9_]{2,40})/gi;

/** Both sides collapse to letters and digits, so "Orbital Post" answers to @orbitalpost. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Startup ids mentioned in the text, deduplicated, in first-appearance order.
 * Unresolvable mentions are dropped — they render as the literal text the user
 * typed, which is the honest outcome.
 */
export function parseMentions(text: string, startups: FailedStartup[]): string[] {
  const byName = new Map<string, string>();
  for (const s of startups) byName.set(normalise(s.name), s.id);

  const found: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const id = byName.get(normalise(match[2]));
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}
