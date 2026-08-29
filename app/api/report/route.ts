/**
 * POST /api/report — Claude's diligence write-up for one idea. Owner: Yeriel.
 *
 * Contract: ReportRequest in, ReportResponse out. See app/api/README.md.
 *
 * STATUS: STUB. Returns canned Markdown built from whatever matches it is
 * handed. Does not call Claude. Sets `x-graveyard-stub: true`.
 */
import { NextResponse } from "next/server";
import type { ApiError, ReportRequest, ReportResponse } from "@/lib/types";

export const runtime = "nodejs";

/** Reports can take a while once Claude is real. Give it room. */
export const maxDuration = 60;

function stubReport(query: string, names: string[]): string {
  return [
    "> **Stubbed report.** `/api/report` does not call Claude yet.",
    "",
    "## The idea",
    "",
    query,
    "",
    "## Who already tried it",
    "",
    names.length > 0
      ? names.map((n) => `- ${n}`).join("\n")
      : "- (no matches were passed to this endpoint)",
    "",
    "## Root cause pattern",
    "",
    "TODO(Yeriel): prompt Claude with the matched startups and ask for the",
    "*root* cause these failures share, the specific trap this founder is",
    "walking into, and what would have to be true for this attempt to differ.",
    "",
    "## What would have to be different",
    "",
    "TODO.",
  ].join("\n");
}

export async function POST(
  request: Request,
): Promise<NextResponse<ReportResponse | ApiError>> {
  let body: ReportRequest;
  try {
    body = (await request.json()) as ReportRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const names = Array.isArray(body.matches)
    ? body.matches.map((m) => m?.name).filter(Boolean)
    : [];

  const payload: ReportResponse = { query, report: stubReport(query, names) };

  return NextResponse.json(payload, { headers: { "x-graveyard-stub": "true" } });
}
