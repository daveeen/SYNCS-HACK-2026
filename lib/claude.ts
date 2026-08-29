/**
 * The Anthropic client. Owner: Yeriel.
 *
 * SERVER ONLY. ANTHROPIC_API_KEY must never reach the browser, so this module
 * is only ever imported from app/api/* route handlers (CLAUDE.md rule 4).
 *
 * STATUS: scaffold. No route calls Claude yet — they all return mock data.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The plan says "claude-opus" for report quality. That is the family name,
 * not a callable id — the API needs a concrete one. Change this in ONE place.
 * Swap to "claude-sonnet-5" if report latency hurts the live demo.
 */
export const REPORT_MODEL = "claude-opus-5";

/** Cheaper/faster model for bulk pipeline enrichment of ~50 startups. */
export const ENRICH_MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;

/**
 * Returns the shared Anthropic client, or throws a clear error if the key is
 * missing. Throwing beats silently degrading: a route that quietly returns a
 * fake report is how we end up demoing a lie.
 */
export function getClaude(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add the key.",
    );
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

/** True if we can call Claude at all. Routes use this to decide stub vs real. */
export function hasClaudeKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
