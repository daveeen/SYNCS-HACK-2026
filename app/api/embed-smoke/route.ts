/**
 * TEMPORARY deploy gate. Owner: Yeriel. Delete once the Vercel build is green.
 *
 * Exists to answer one question before any other backend work: does a Vercel
 * function containing onnxruntime-node plus committed weights deploy at all,
 * or does it blow the 250MB unzipped limit?
 *
 * GET so it can be hit from a browser address bar.
 */
import { NextResponse } from "next/server";
import { embedOne, EMBEDDING_DIMS } from "@/lib/embed";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  const vector = await embedOne("same-day grocery delivery in the suburbs");
  return NextResponse.json({
    dims: vector.length,
    expected: EMBEDDING_DIMS,
    coldStartMs: Date.now() - started,
  });
}
