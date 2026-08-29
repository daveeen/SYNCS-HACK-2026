/**
 * Where the forum meets the graveyard. Owner: Yeriel.
 *
 * Reuses embedOne() and rankByVector() unchanged. This is the feature that
 * makes the forum ours rather than generic: post an idea, and the companies
 * that already died doing it appear underneath it.
 */
import "server-only";
import { embedOne } from "@/lib/embed";
import { rankByVector } from "@/lib/search";
import { loadStartups, loadVectors } from "@/lib/data";

/** Top N matches above the floor. Both numbers are guesses until there is real data. */
const TOP_N = 3;

/**
 * A bad match is worse than no match — three irrelevant tombstones at 0.11 make
 * the whole feature look broken, while zero tombstones just looks like a post
 * about nothing in particular.
 */
const SIMILARITY_FLOOR = 0.3;

/** Bounds embedding cost on a long post. MiniLM truncates anyway; this is explicit. */
const MAX_CHARS = 2000;

export type PostMatch = { startup_id: string; similarity: number };

export async function matchPost(title: string, body: string): Promise<PostMatch[]> {
  const vector = await embedOne(`${title}. ${body}`.slice(0, MAX_CHARS));
  return rankByVector(vector, loadStartups(), loadVectors(), TOP_N)
    .filter((m) => m.similarity >= SIMILARITY_FLOOR)
    .map((m) => ({ startup_id: m.id, similarity: Number(m.similarity.toFixed(4)) }));
}
