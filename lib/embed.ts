/**
 * The embedding wrapper. Owner: Yeriel.
 *
 * The ONLY function in the codebase that turns text into a vector. The route
 * and the pipeline both call embed(); swapping MiniLM for a hosted provider
 * later means editing this file and nothing else.
 *
 * No `server-only` guard here on purpose: scripts/pipeline/embed.ts and
 * scripts/check.ts import embed() under plain Node, where that package throws.
 * The guard lives on lib/data.ts and lib/claude.ts instead.
 */
import path from "node:path";
import { pipeline, env } from "@xenova/transformers";
import type { FailedStartup } from "@/lib/types";

/** Model we standardised on: local, no API key, 384 dimensions. */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

// Weights ship in the repo under models/. The default (allowRemoteModels = true)
// makes a cold lambda pull ~90MB from huggingface.co into /tmp on the judge's
// first query, over conference wifi. That is the single most likely way to lose
// the demo.
env.allowRemoteModels = false;
env.localModelPath = path.join(process.cwd(), "models");

/**
 * Structural type rather than the library's exported one — this pins the exact
 * surface we use and survives a types reshuffle in the package.
 */
type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

// Loading the model is slow. Cached across invocations; never per request.
let extractor: Extractor | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = (await pipeline("feature-extraction", EMBEDDING_MODEL, {
      quantized: true,
    })) as unknown as Extractor;
  }
  return extractor;
}

/**
 * What text represents a startup for matching purposes. The single biggest
 * lever on match quality — bigger than the model choice.
 *
 * Deliberately short: a founder types one line, and matching that against a
 * full multi-paragraph record is an asymmetry that degrades results badly.
 * proximateCause / rootCause / lesson are excluded on purpose — a founder
 * describes what a company DOES, not how it died, and including the failure
 * analysis pulls matches toward companies that died the same way rather than
 * companies that tried the same thing.
 *
 * This is a tuning knob. If matches look bad, change this before anything else
 * — and re-run `pnpm pipeline:embed`, because both sides must move together.
 */
export function embeddingText(s: FailedStartup): string {
  return [s.tagline, s.description.slice(0, 300), s.industry]
    .filter(Boolean)
    .join(". ");
}

/** Embed one or more strings. Returns one vector per input, in order. */
export async function embed(texts: string[]): Promise<number[][]> {
  const pipe = await getExtractor();
  const out = await pipe(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}

/** Convenience for the single-string case. */
export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1].
 * Pure maths, no dependencies.
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
