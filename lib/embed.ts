/**
 * The embedding wrapper. Owner: Yeriel.
 *
 * The ONLY function in the codebase that turns text into a vector. Everything
 * else (the pipeline, /api/search) calls embed(). Swapping MiniLM for a hosted
 * provider later means editing this file and nothing else.
 *
 * SERVER ONLY. Never import this from a client component.
 *
 * STATUS: NOT IMPLEMENTED — this is scaffold. See the TODO below.
 */
import "server-only";

/** Model we standardised on: local, no API key, 384 dimensions. */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

/**
 * Embed one or more strings. Returns one vector per input, in order.
 *
 * TODO(Yeriel): implement with @xenova/transformers, e.g.
 *
 *   import { pipeline } from "@xenova/transformers";
 *   let extractor: unknown; // cache across invocations — loading is slow
 *   const pipe = await pipeline("feature-extraction", EMBEDDING_MODEL);
 *   const out = await pipe(texts, { pooling: "mean", normalize: true });
 *
 * Cache the pipeline in a module-level variable: the first call downloads
 * ~90MB of model weights and must not happen per request.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  void texts;
  throw new Error(
    "embed() is not implemented yet. Owner: Yeriel. " +
      "Until it lands, /api/search uses the keyword stub in lib/search.ts.",
  );
}

/** Convenience for the single-string case. */
export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1].
 * Pure maths, no dependencies — this one IS implemented and tested by eye.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
