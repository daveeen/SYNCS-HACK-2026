/**
 * POST /api/search — the core endpoint. Owner: Yeriel.
 *
 * Contract: SearchRequest in, SearchResponse out. See app/api/README.md.
 *
 * STATUS: STUB. Returns real records from data/, ranked by a keyword scorer
 * (lib/search.ts), with a canned report string. No embeddings, no Claude yet.
 * Responses carry `x-graveyard-stub: true` so nobody demos this by accident.
 */
import { NextResponse } from "next/server";
import { loadStartups, isUsingMockData } from "@/lib/data";
import { rankByKeyword } from "@/lib/search";
import type { ApiError, SearchRequest, SearchResponse } from "@/lib/types";

export const runtime = "nodejs";

const STUB_REPORT = [
  "> **Stubbed report.** `/api/search` is scaffold: matches are keyword-ranked,",
  "> not semantically matched, and this text did not come from Claude.",
  "",
  "## What the graveyard says about this idea",
  "",
  "Real reports land here once `/api/report` is wired to Claude. The shape is",
  "Markdown and the UI should render it as such.",
].join("\n");

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

  const limit = Math.min(Math.max(body.limit ?? 5, 1), 20);
  const matches = rankByKeyword(query, loadStartups(), limit);

  const payload: SearchResponse = { query, matches, report: STUB_REPORT };

  return NextResponse.json(payload, {
    headers: {
      "x-graveyard-stub": "true",
      "x-graveyard-mock-data": String(isUsingMockData()),
    },
  });
}
