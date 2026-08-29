/**
 * POST /api/report — the diligence write-up for one idea. Owner: Yeriel.
 *
 * Contract: ReportRequest in, a text/plain stream of Markdown out. See
 * docs/backend-spec.md §7.
 *
 * THREE SOURCES, IN ORDER. Every one of them produces the same document; they
 * differ in how good it reads and what it costs.
 *
 *   1. The Postgres cache. Same model, same idea, same five companies means the
 *      same answer, so it is written once and served from the database after
 *      that. Free, instant, and it doubles as the log of what Claude was given.
 *   2. Claude Haiku. The version that can reason about the founder's specific
 *      idea rather than only reprinting what the archive holds.
 *   3. lib/report.ts, a pure function over the matched records. Used whenever
 *      there is no ANTHROPIC_API_KEY, and whenever the model call fails. NOT a
 *      stub: every sentence traces to a field Davin QA'd, which is why it is
 *      the floor rather than an error page.
 *
 * `x-graveyard-report-source` says which one answered.
 */
import { NextResponse } from "next/server";
import { hasClaudeKey, REPORT_MODEL } from "@/lib/claude";
import { getStartupById } from "@/lib/data";
import { composeReport } from "@/lib/report";
import { composeReportWithClaude } from "@/lib/report-claude";
import { cacheKey, readCachedReport, writeCachedReport } from "@/lib/report-cache";
import type { ApiError, ReportRequest, StartupMatch } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Room for one Haiku call plus a cache round trip. The composer path returns in
 * single-digit milliseconds and never approaches this.
 */
export const maxDuration = 30;

const MAX_QUERY_CHARS = 500;
const MAX_MATCHES = 20;

/** Where the report came from. Rendered as a provenance line in the UI. */
type ReportSource = "cache" | "claude" | "composed";

/**
 * Take the id and the similarity from the request; take EVERY WORD from our own
 * corpus.
 *
 * The body is client-supplied. Validating its fields by type was not enough:
 * `name`, `tagline`, `rootCause`, `lesson` and the rest were free strings that
 * went straight into the prompt and out into a document bylined "written by
 * Claude Haiku from the records above". Anyone could POST doctored prose under
 * the real ids and, because the cache key is the query plus those ids, have the
 * result served to the next honest visitor who searched the same thing.
 *
 * Looking the record up by id closes that, and two other things with it: the
 * cache can no longer go stale when the corpus is re-enriched under an
 * unchanged key, and several KB of prose the server already holds stops being
 * round-tripped through the browser on every report.
 *
 * `similarity` is the one field that legitimately comes from the caller: it is
 * a property of their query against the ranking, not of the record.
 */
function resolveMatches(raw: unknown): StartupMatch[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StartupMatch[] = [];

  for (const item of raw.slice(0, MAX_MATCHES)) {
    if (!item || typeof item !== "object") continue;
    const { id, similarity } = item as { id?: unknown; similarity?: unknown };
    if (typeof id !== "string" || seen.has(id)) continue;

    const record = getStartupById(id);
    if (!record) continue;                       // unknown id: silently dropped

    seen.add(id);
    out.push({
      ...record,
      similarity:
        typeof similarity === "number" && Number.isFinite(similarity)
          ? Math.min(Math.max(similarity, 0), 1)
          : 0,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Rate limit on the PAID path only.
 *
 * The cache bounds repeat spend, not first-time spend: the caller chooses the
 * query, and a fresh one always misses. Without this, a script varying the
 * query is unbounded Anthropic billing against an endpoint that needs no auth.
 *
 * In-memory and therefore per-instance, which is the honest description: it is
 * a spend brake, not a security control. A serverless fleet multiplies the
 * ceiling by the instance count. It costs nothing and removes the trivial
 * version of the attack; a real limit belongs at the edge.
 * ------------------------------------------------------------------ */
const WINDOW_MS = 60_000;
const MAX_CALLS = 12;
const seen = new Map<string, number[]>();

function overRateLimit(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const now = Date.now();
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  seen.set(ip, recent);

  // The map would otherwise grow one entry per address for the life of the
  // instance. Cheap sweep, only when it has actually grown.
  if (seen.size > 500) {
    for (const [key, times] of seen) {
      if (times.every((t) => now - t >= WINDOW_MS)) seen.delete(key);
    }
  }
  return recent.length > MAX_CALLS;
}

function streamString(text: string, source: ReportSource, model?: string): Response {
  const encoder = new TextEncoder();
  const headers: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-graveyard-report-source": source,
  };
  if (model) headers["x-graveyard-report-model"] = model;

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    { headers },
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

  const matches = resolveMatches(body.matches);

  // No key: the deterministic composer IS the product, not a placeholder.
  // Nothing below can run without one, so leave before touching the cache.
  if (!hasClaudeKey() || matches.length === 0) {
    return streamString(composeReport(query, matches), "composed");
  }

  // Only the paid path is limited. The composer is free and local, so a caller
  // who trips this still gets a real report rather than a 429.
  if (overRateLimit(request)) {
    console.warn("report: rate limited, composing instead");
    return streamString(composeReport(query, matches), "composed");
  }

  const key = cacheKey(REPORT_MODEL, query, matches);

  const cached = await readCachedReport(key);
  if (cached) return streamString(cached.report, "cache", cached.model);

  try {
    const written = await composeReportWithClaude(query, matches);
    // Awaited, not fire-and-forget. On a serverless runtime the function can be
    // frozen the moment the response is returned, so an un-awaited write is a
    // write that sometimes silently does not happen, and the cache would never
    // fill. It is a single insert against a primary key.
    await writeCachedReport({
      key,
      query,
      matches,
      model: written.model,
      report: written.report,
      inputTokens: written.inputTokens,
      outputTokens: written.outputTokens,
    });
    return streamString(written.report, "claude", written.model);
  } catch (err) {
    // Anthropic is down, rate-limiting, or the key is bad. The composer still
    // has every reviewed field, so the user gets a real report either way.
    console.error("report: Claude failed, composing instead:", err instanceof Error ? err.message : err);
    return streamString(composeReport(query, matches), "composed");
  }
}
