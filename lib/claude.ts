/**
 * The Anthropic client. Owner: Yeriel.
 *
 * SERVER ONLY in the sense that matters: ANTHROPIC_API_KEY must never reach the
 * browser (CLAUDE.md rule 4). There is no `server-only` guard, though, because
 * this module's only consumer is now scripts/pipeline/enrich.ts running under
 * plain Node via tsx, where that package throws on import. Never import this
 * from a client component — nothing enforces that for you any more.
 *
 * No route handler calls Claude. /api/report composes its report from the
 * enriched fields by pure function (lib/report.ts). Claude is used only by
 * scripts/pipeline/enrich.ts, at build time, where Davin QAs the output.
 */
import Anthropic from "@anthropic-ai/sdk";

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
