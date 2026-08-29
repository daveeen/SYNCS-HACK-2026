/**
 * POST /api/report — Claude's diligence write-up for one idea. Owner: Yeriel.
 *
 * Returns a text/plain STREAM of Markdown, not JSON. See docs/backend-spec.md §7.
 * The client appends chunks to a string; there is no envelope because the
 * payload is one Markdown document.
 *
 * Never returns a canned report dressed as a real one. No key or a failed call
 * is a 500 and a visible error state — the tombstones are already on screen
 * from /api/search, so the demo degrades rather than dying.
 */
import { NextResponse } from "next/server";
import { getClaude, hasClaudeKey, REPORT_MODEL } from "@/lib/claude";
import plantedReports from "@/data/reports.planted.json";
import type { ApiError, ReportRequest, StartupMatch } from "@/lib/types";

export const runtime = "nodejs";

/** Hobby's ceiling. Raising this does nothing without a plan upgrade. */
export const maxDuration = 60;

const MAX_QUERY_CHARS = 500;
const MAX_MATCHES = 20;

const REPORT_SYSTEM = `You are a diligence analyst writing for a founder who has just described a
startup idea. You are given real failed startups matched to that idea. Tell them
what the graveyard says — specifically, and without flattery.

RULES
- Reason ONLY from the records in the user message. You have no other knowledge
  of these companies.
- A field reading "unknown" is unknown. Never fill a gap with a plausible guess.
- Name the companies. "Several startups have failed here" is worthless.
  "Webvan and Kozmo both died on the same density maths" is the product.
- Separate symptom from disease. Almost every dead startup ran out of cash. Say
  what made the cash run out.
- If the matches are weak or off-topic, say so in one sentence and write a
  shorter report. A manufactured pattern is worse than admitting there isn't one.
- No hedging, no "it's important to note", no closing pep talk.

OUTPUT
Markdown, exactly these four H2 sections, in order:

## The idea as we read it
One or two sentences, plainest possible terms. If the idea is ambiguous, say
which reading you took.

## Who already tried it
One bullet per matched company: name, years, what they actually did, what killed
them. Only companies from the supplied records.

## The pattern
The root cause these failures share, if they share one. If timing was the real
story, say so and say what has changed since. If they died of different things,
say that — a false pattern is worse than none.

## What would have to be different
The specific trap this founder is walking into, and what would have to be true
for their attempt to end differently. Concrete and testable, never "focus on
execution".`;

/**
 * Fields Claude sees. `sources` is excluded on purpose: the URLs are pure token
 * cost, the cards already display them, and a model handed URLs will eventually
 * emit a subtly wrong one.
 */
function forPrompt(m: StartupMatch) {
  return {
    name: m.name,
    tagline: m.tagline,
    description: m.description,
    industry: m.industry,
    foundedYear: m.foundedYear,
    diedYear: m.diedYear,
    fundingRaised: m.fundingRaised,
    proximateCause: m.proximateCause,
    rootCause: m.rootCause,
    timingNote: m.timingNote,
    lesson: m.lesson,
    similarity: Number(m.similarity.toFixed(3)),
  };
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

const STREAM_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
};

/** Serve a pre-written report through the same streaming interface. */
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
  const matches = body.matches
    .slice(0, MAX_MATCHES)
    .filter((m) => m && typeof m.id === "string" && typeof m.name === "string");

  // Planted reports win over Claude. This is the plan's own fallback #3, and it
  // means adopting it on stage is a data edit rather than a code change.
  const planted = (plantedReports as Record<string, string>)[normalizeQuery(query)];
  if (planted) return streamString(planted);

  if (!hasClaudeKey()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set — no report can be generated" },
      { status: 500 },
    );
  }

  const userMessage = [
    `The founder's idea:\n\n${query}`,
    "",
    `Matched failed startups (JSON):\n\n${JSON.stringify(matches.map(forPrompt), null, 2)}`,
  ].join("\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const claudeStream = getClaude().messages.stream({
          model: REPORT_MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: REPORT_SYSTEM,
          messages: [{ role: "user", content: userMessage }],
        });

        claudeStream.on("text", (text) => {
          controller.enqueue(encoder.encode(text));
        });

        await claudeStream.finalMessage();
        controller.close();
      } catch (err) {
        // Headers are already sent, so this ends the stream early rather than
        // changing the status. The UI shows what it received and flags it.
        console.error("report: stream failed:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}
