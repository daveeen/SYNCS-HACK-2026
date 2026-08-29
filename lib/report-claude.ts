/**
 * The Claude-written diligence report. Owner: Yeriel.
 *
 * lib/report.ts composes the same document by pure function, and stays the
 * fallback whenever there is no API key or the model call fails. This file is
 * the version that can actually reason about the founder's specific idea:
 * whether their plan repeats the mistake, or differs from it in the way that
 * matters.
 *
 * CLAUDE.md rule 3 says never fabricate failure data. The pure composer makes
 * that structurally true because it only reprints reviewed fields. A model
 * cannot offer the same guarantee, so it is constrained three ways instead:
 *
 *   1. It is given the records and nothing else, with unverified fields
 *      labelled as unverified rather than omitted.
 *   2. The system prompt forbids outside knowledge, including about companies
 *      it will certainly recognise. Digg is in the corpus; what Haiku recalls
 *      about Digg is not.
 *   3. temperature 0, so the same idea and the same five companies produce the
 *      same document. That is also what makes the cache honest, since a cached
 *      answer is then the answer a fresh call would have given.
 */
import { getClaude, REPORT_MODEL } from "@/lib/claude";
import { known } from "@/lib/report";
import { plainDashes } from "@/lib/text";
import type { StartupMatch } from "@/lib/types";

const SYSTEM = `You write short diligence briefs for founders, from a fixed archive of failed startups.

ABSOLUTE RULES

1. Use ONLY the records given in the user message. You will recognise some of these companies. Whatever you remember about them is not evidence and must not appear. If a fact is not in the record, you do not have it.
2. Never invent a cause, a date, a number, or an investor. Where a record says a field is unverified, say the archive does not record it. "We do not know" is a correct and useful answer.
3. Never claim these companies share a cause unless their categorised causes actually match. If the categories are unrecorded, say the archive cannot tell, and do not substitute your own guess. A pattern that is not in the data is the one thing that makes the whole brief untrustworthy.
4. Address the founder's specific idea. Your value over a template is saying which of these failures their plan repeats and which it avoids. Be concrete about that, and be honest when the archive does not settle it.

STYLE

Plain, direct, unsentimental. No hype and no reassurance. Prefer short sentences. Never use an em dash or an en dash, spaced or unspaced; use a comma, a colon or a full stop. Do not open with a summary of what you are about to do. Do not address the reader as "you" more than the analysis needs. Never restate a section's own heading inside its body.

FORMAT

Markdown, using ONLY these constructs: "## " headings, "### " subheadings, "> " blockquote, "- " list items, **bold**, *italic*. No tables, links, images, code fences or horizontal rules. Asterisks must be paired tightly around the emphasised words.

Use exactly this structure:

## The idea as we read it
A blockquote of the founder's idea, verbatim.

## Who already tried it
One "- " item per company: **Name** (years, funding if recorded), what they did in a clause, then what killed them. One or two sentences each.

## The pattern
What the set shows together. If they died of different things, say so and say why that is harder rather than easier. If the archive has no categorised causes, say it cannot tell.

## What this means for your idea
The section the archive cannot write on its own. Which specific failure above is the closest to their plan, what is different about their version, and what would have to be true for it to end differently. No more than one short paragraph plus up to three "- " items.

## What would have to be different
The lessons on record, one "- " item each, in the archive's own words where it has them.

Under 450 words total.`;

/** One record, as the model sees it. Unverified fields are marked, not dropped. */
function renderRecord(m: StartupMatch, index: number): string {
  const line = (label: string, value: string) =>
    known(value) ? `  ${label}: ${value}` : `  ${label}: NOT RECORDED, do not guess`;

  return [
    `RECORD ${index + 1}`,
    `  name: ${m.name}`,
    `  what they did: ${m.tagline}`,
    `  description: ${m.description}`,
    `  industry: ${m.industry}`,
    `  operated: ${m.foundedYear} to ${m.diedYear}`,
    line("funding raised", m.fundingRaised),
    line("proximate cause, the symptom", m.proximateCause),
    line("root cause, the disease", m.rootCause),
    m.rootCauseCategory === "unknown"
      ? "  cause category: NOT RECORDED, do not guess"
      : `  cause category: ${m.rootCauseCategory}`,
    line("timing", m.timingNote),
    line("lesson", m.lesson),
    `  similarity to the idea: ${m.similarity.toFixed(2)}`,
  ].join("\n");
}

export type ClaudeReport = {
  report: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

/**
 * Write the report. Throws on any API failure so the route can fall back to the
 * deterministic composer rather than showing the user an error: a report that
 * reads less well is a far better outcome than no report at all.
 */
export async function composeReportWithClaude(
  query: string,
  matches: StartupMatch[],
): Promise<ClaudeReport> {
  const categorised = matches.filter((m) => m.rootCauseCategory !== "unknown").length;

  const user = [
    "THE FOUNDER'S IDEA",
    query.trim(),
    "",
    `THE ARCHIVE'S ${matches.length} CLOSEST MATCHES`,
    "",
    matches.map(renderRecord).join("\n\n"),
    "",
    // Stated explicitly rather than left for the model to infer from the
    // records, because "how many of these are categorised" is precisely the
    // judgement it is most tempted to fill in for itself.
    categorised === 0
      ? "NOTE: none of these records has a categorised cause. You cannot say whether they died of the same thing or of different things. Say that plainly in The pattern."
      : `NOTE: ${categorised} of ${matches.length} records have a categorised cause. Only claim a shared pattern if those categories actually match.`,
  ].join("\n");

  const message = await getClaude().messages.create({
    model: REPORT_MODEL,
    max_tokens: 1400,
    // Deterministic, so the cached answer is the answer a fresh call would give.
    temperature: 0,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });

  // Normalised BEFORE it is returned, so the copy is clean and the cache stores
  // the clean version. The system prompt asks for no dashes and Haiku produces
  // about twenty per report regardless; a house style rule that only exists
  // inside a prompt is a request, not a rule.
  const report = plainDashes(
    message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim(),
  );

  if (!report) throw new Error("Claude returned an empty report");

  // A report cut off at max_tokens is non-empty, so the check above waves it
  // through: it ends mid-sentence, often mid-**bold**, and there is no TTL or
  // invalidation path, so caching it would serve that fragment to everyone who
  // asks this question from now on. Throwing hands the request to the composer.
  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude hit the token ceiling and the report is truncated");
  }

  return {
    report,
    model: REPORT_MODEL,
    inputTokens: message.usage?.input_tokens,
    outputTokens: message.usage?.output_tokens,
  };
}
