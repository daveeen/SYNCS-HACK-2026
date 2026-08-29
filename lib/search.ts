/**
 * Matching. Owner: Yeriel.
 *
 * SCAFFOLD STATUS: the real implementation is embed(query) + cosine over
 * precomputed vectors. That needs lib/embed.ts and the enriched JSON, neither
 * of which exists yet — so this file ships a deliberately dumb keyword scorer
 * so the frontend has something that varies with input from hour 0.
 *
 * The stub is NOT silent: /api/search sets the header `x-graveyard-stub: true`
 * whenever these scores were produced here rather than by real embeddings.
 * Delete this whole file once embed() lands.
 */
import type { FailedStartup, StartupMatch } from "@/lib/types";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "how", "i", "in", "is", "it", "its", "of", "on", "or", "our", "that",
  "the", "their", "then", "there", "they", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "will", "with", "you", "your",
  "app", "startup", "platform", "product", "idea", "business", "company",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Everything about a startup that a query could plausibly match against. */
function haystack(s: FailedStartup): string {
  return [s.name, s.tagline, s.description, s.industry, s.rootCause, s.lesson]
    .join(" ");
}

/**
 * Jaccard-ish overlap in [0, 1]. This is a placeholder for cosine similarity —
 * it has no semantic understanding at all, so "grocery delivery" will match
 * Fetchly but "food logistics" will not. That gap IS the demo: it is exactly
 * what real embeddings fix.
 */
function keywordScore(queryTokens: string[], s: FailedStartup): number {
  if (queryTokens.length === 0) return 0;
  const docTokens = new Set(tokenize(haystack(s)));
  if (docTokens.size === 0) return 0;
  let hits = 0;
  for (const t of new Set(queryTokens)) if (docTokens.has(t)) hits++;
  return hits / new Set(queryTokens).size;
}

/**
 * Rank startups against a free-text idea. Returns the top `limit`, highest
 * similarity first.
 *
 * TODO(Yeriel): replace the body with
 *   const q = await embedOne(query);
 *   score = cosineSimilarity(q, startup.embedding)
 * once the pipeline writes an `embedding` field into the enriched JSON.
 */
export function rankByKeyword(
  query: string,
  startups: FailedStartup[],
  limit = 5,
): StartupMatch[] {
  const queryTokens = tokenize(query);
  return startups
    .map((s) => ({ ...s, similarity: keywordScore(queryTokens, s) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
