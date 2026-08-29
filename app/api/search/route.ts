/**
 * POST /api/search — the core endpoint. Owner: Yeriel.
 *
 * Contract: SearchRequest in, SearchResponse out. See app/api/README.md and
 * docs/backend-spec.md §6.
 *
 * `report` is ALWAYS "" here. Reports come from POST /api/report, streamed, so
 * tombstones paint immediately instead of waiting on Claude.
 *
 * This route never touches Anthropic. An Anthropic outage costs the report and
 * nothing else.
 */
import { NextResponse } from "next/server";
import { loadStartups, loadVectors, isUsingMockData } from "@/lib/data";
import { embedOne } from "@/lib/embed";
import { rankByVector, rankByBM25 } from "@/lib/search";
import type { ApiError, SearchRequest, SearchResponse, StartupMatch } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_QUERY_CHARS = 500;

export async function POST(
  request: Request,
): Promise<NextResponse<SearchResponse | ApiError>> {
  let body: SearchRequest;
  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: `query must be ${MAX_QUERY_CHARS} characters or fewer` },
      { status: 400 },
    );
  }

  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.min(Math.max(Math.floor(body.limit), 1), 20)
      : 5;

  const startups = loadStartups();

  let matches: StartupMatch[];
  let degraded: string | null = null;

  try {
    const queryVector = await embedOne(query);
    matches = rankByVector(queryVector, startups, loadVectors(), limit);
  } catch (err) {
    // No retry: a cold start that already blew the budget will not succeed on a
    // second attempt inside the same invocation, and BM25 answers in single-digit ms.
    degraded = err instanceof Error ? err.name : "embed-failed";
    console.error("search: embed() failed, falling back to BM25:", err);
    matches = rankByBM25(query, startups, limit);
  }

  const headers: Record<string, string> = {
    "x-graveyard-mock-data": String(isUsingMockData()),
  };
  if (degraded) {
    headers["x-graveyard-degraded"] = "true";
    headers["x-graveyard-degraded-reason"] = degraded;
  }

  const payload: SearchResponse = { query, matches, report: "" };
  return NextResponse.json(payload, { headers });
}
