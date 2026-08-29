/**
 * Matching. Owner: Yeriel.
 *
 * Two rankers. rankByVector is the real one. rankByBM25 exists only for when
 * embed() throws — /api/search sets `x-graveyard-degraded: true` whenever the
 * scores came from here, so a keyword result can never be presented as a
 * semantic one.
 */
import { cosineSimilarity } from "@/lib/embed";
import type { FailedStartup, StartupMatch, StartupVectors } from "@/lib/types";

const K1 = 1.5;
const B = 0.75;

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

/**
 * Everything a query could plausibly match against. Wider than
 * embeddingText() on purpose: the fallback has no semantics, so it needs every
 * literal token it can get.
 */
function haystack(s: FailedStartup): string {
  return [s.name, s.tagline, s.description, s.industry, s.rootCause, s.lesson].join(" ");
}

/**
 * The real matcher: cosine between the query vector and each precomputed
 * corpus vector.
 *
 * A record with no vector (or a mismatched one) scores 0 instead of throwing —
 * a half-embedded corpus should degrade, not 500.
 */
export function rankByVector(
  queryVector: number[],
  startups: FailedStartup[],
  vectors: StartupVectors,
  limit = 5,
): StartupMatch[] {
  return startups
    .map((s) => {
      const v = vectors[s.id];
      const raw =
        v && v.length === queryVector.length ? cosineSimilarity(queryVector, v) : 0;
      // The contract promises [0,1]; a normalised cosine can land marginally negative.
      return { ...s, similarity: Math.max(0, Math.min(1, raw)) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * The fallback, used only when embed() throws. Okapi BM25 over the corpus.
 */
export function rankByBM25(
  query: string,
  startups: FailedStartup[],
  limit = 5,
): StartupMatch[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || startups.length === 0) return [];

  const docs = startups.map((s) => tokenize(haystack(s)));
  const n = docs.length;
  const avgdl = docs.reduce((sum, d) => sum + d.length, 0) / n || 1;

  // ponytail: IDF recomputed per call. Fine over ~55 docs; cache the table if
  // the corpus ever passes a few thousand records.
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const raw = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const t of queryTokens) {
      const f = tf.get(t) ?? 0;
      if (f === 0) continue;
      const dfT = df.get(t) ?? 0;
      const idf = Math.log(1 + (n - dfT + 0.5) / (dfT + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avgdl)));
    }
    return score;
  });

  // BM25 is unbounded and the contract promises [0,1]. Normalising by the top
  // score keeps the ORDER honest and the range legal. These numbers are ranks,
  // not cosines — never compare them against a real similarity. The
  // x-graveyard-degraded header is what tells the UI which kind it got.
  const max = Math.max(...raw, 0);

  return startups
    .map((s, i) => ({ ...s, similarity: max > 0 ? raw[i] / max : 0 }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
