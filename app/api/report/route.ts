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
import { ROOT_CAUSE_CATEGORIES } from "@/lib/types";
import type {
  ApiError,
  ReportRequest,
  RootCauseCategory,
  StartupMatch,
} from "@/lib/types";

export const runtime = "nodejs";

/** No model call, so no reason for the old 60s budget. */
export const maxDuration = 10;

const MAX_QUERY_CHARS = 500;
const MAX_MATCHES = 20;

const STREAM_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Does this match carry everything composeReport() reads?
 *
 * The body is client-supplied, so a caller can post `{id, name}` and nothing
 * else. Checking only those two produced "2000–undefined" lifespans and
 * "died of the same thing: **undefined**" — the fabricated output the whole
 * pure-function design exists to make impossible. A partial match is dropped
 * rather than rendered, because a report is only as trustworthy as its worst
 * line.
 */
function isRenderable(m: unknown): m is StartupMatch {
  if (!m || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.tagline === "string" &&
    typeof r.rootCause === "string" &&
    // Must be a MEMBER of the vocabulary, not merely a string. The matches come
    // from the request body, and this value is interpolated into Markdown as
    // `died of the same thing: **X**` — so an arbitrary string is a content
    // injection into a document we tell the user is derived from our records.
    ROOT_CAUSE_CATEGORIES.includes(r.rootCauseCategory as RootCauseCategory) &&
    typeof r.timingNote === "string" &&
    typeof r.lesson === "string" &&
    typeof r.fundingRaised === "string" &&
    typeof r.foundedYear === "number" &&
    typeof r.diedYear === "number" &&
    typeof r.similarity === "number"
  );
}

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

  const matches: StartupMatch[] = body.matches.slice(0, MAX_MATCHES).filter(isRenderable);

  return streamString(composeReport(query, matches));
}
