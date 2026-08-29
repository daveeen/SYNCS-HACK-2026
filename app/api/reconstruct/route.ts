/**
 * POST /api/reconstruct — pull a dead startup's old homepage out of the
 * Wayback Machine. Owner: Yeriel. This is the demo's "wow" moment.
 *
 * Contract: ReconstructRequest in, ReconstructResponse out. See app/api/README.md.
 *
 * STATUS: STUB. Always reports "not available" without calling the archive.
 * Sets `x-graveyard-stub: true`.
 */
import { NextResponse } from "next/server";
import type { ApiError, ReconstructRequest, ReconstructResponse } from "@/lib/types";

export const runtime = "nodejs";

/**
 * TODO(Yeriel): call the Internet Archive Availability API:
 *
 *   https://archive.org/wayback/available?url=<domain>&timestamp=<YYYY>
 *
 * It returns { archived_snapshots: { closest: { url, timestamp, available } } }.
 * Note two traps: (1) many snapshots refuse to render in an <iframe>, so plan
 * a screenshot fallback; (2) the API is flaky under load — cache results for
 * the planted demo ideas rather than hitting it live on stage.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<ReconstructResponse | ApiError>> {
  let body: ReconstructRequest;
  try {
    body = (await request.json()) as ReconstructRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const payload: ReconstructResponse = {
    url,
    snapshotUrl: null,
    timestamp: null,
    available: false,
  };

  return NextResponse.json(payload, { headers: { "x-graveyard-stub": "true" } });
}
