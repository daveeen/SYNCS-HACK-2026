/**
 * POST /api/report — the diligence write-up for one idea. Owner: Yeriel.
 *
 * Contract: ReportRequest in, a text/plain stream of Markdown out. See
 * docs/backend-spec.md §7.
 *
 * NO LLM AT REQUEST TIME. The report is composed by a pure function over the
 * matched records (lib/report.ts). Claude still does the reasoning, but in
 * scripts/pipeline/enrich.ts at build time, where Davin QAs every field against
 * its sources. Every sentence here traces to a reviewed field.
 *
 * The wire contract is unchanged on purpose — still text/plain, still chunked —
 * so the frontend does not have to be rewritten a second time. It simply
 * arrives in one chunk now, and instantly.
 */
import { NextResponse } from "next/server";
import { composeReport } from "@/lib/report";
import type { ApiError, ReportRequest, StartupMatch } from "@/lib/types";

export const runtime = "nodejs";

/** No model call, so no reason for the old 60s budget. */
export const maxDuration = 10;

const MAX_QUERY_CHARS = 500;
const MAX_MATCHES = 20;

const STREAM_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
};

function streamString(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    { headers: STREAM_HEADERS },
  );
}

export async function POST(request: Request): Promise<Response | NextResponse<ApiError>> {
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
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: `query must be ${MAX_QUERY_CHARS} characters or fewer` },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.matches)) {
    return NextResponse.json({ error: "matches must be an array" }, { status: 400 });
  }

  const matches: StartupMatch[] = body.matches
    .slice(0, MAX_MATCHES)
    .filter((m) => m && typeof m.id === "string" && typeof m.name === "string");

  return streamString(composeReport(query, matches));
}
