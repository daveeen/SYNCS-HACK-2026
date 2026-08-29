/**
 * The diligence report. Owner: Yeriel.
 *
 * A PURE FUNCTION over the matched records. No LLM at request time.
 *
 * Claude still does the reasoning — in scripts/pipeline/enrich.ts, once per
 * startup, at build time, where Davin QAs every field against its sources.
 * This file only composes what was already written and checked. That is the
 * whole point: every sentence in the output traces to a reviewed field, so
 * CLAUDE.md rule 3 ("never fabricate failure data") stops being a prompt
 * instruction the model might ignore and becomes structurally true.
 *
 * Consequences worth knowing:
 *   - Instant. No streaming, no 60s ceiling, no first-token pause on stage.
 *   - Free, and unaffected by an Anthropic outage during judging.
 *   - Cannot reason about the founder's specific idea the way a model can.
 *     It names the pattern the corpus shows; it does not invent an insight.
 */
import type { RootCauseCategory, StartupMatch } from "@/lib/types";

/** A field the pipeline could not verify. Never printed as though it were a fact. */
function known(value: string): boolean {
  return Boolean(value) && value.trim().toLowerCase() !== "unknown";
}

/**
 * Exactly one trailing full stop. Some taglines in the corpus already carry
 * one, and appending blindly produced "…tried to beat.." in the output.
 */
function sentence(text: string): string {
  const t = text.trim().replace(/[.!?]+$/, "");
  return `${t}.`;
}

/**
 * The lead sentence of a cause, for the summary list.
 *
 * `rootCause` in the real corpus averages ~440 characters and runs to 700 —
 * genuinely good analysis, and completely unreadable as five stacked bullets.
 * The list answers "who died and roughly why"; the full text belongs on the
 * tombstone card, where there is room for it.
 *
 * Capped at 170 characters: long enough to carry a real cause, short enough
 * that five of them stack into something a judge will actually read.
 *
 * Splits on sentence-ending punctuation followed by a space, so decimals and
 * "Inc." survive. Falls back to a hard truncation if the text is one long
 * sentence, which most of these are.
 */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  const lead = (match?.[0] ?? trimmed).trim();
  if (lead.length <= 170) return lead.endsWith(".") ? lead : `${lead}.`;
  return `${lead.slice(0, 167).trimEnd()}…`;
}

function lifespan(m: StartupMatch): string {
  const years = `${m.foundedYear}–${m.diedYear}`;
  return known(m.fundingRaised) ? `${years}, ${m.fundingRaised}` : years;
}

/**
 * Categories shared by two or more matches, most common first. This is the
 * only thing rootCauseCategory exists for, and the only reason it had to be a
 * controlled vocabulary rather than free text.
 */
function sharedCategories(
  matches: StartupMatch[],
): Array<{ category: RootCauseCategory; members: StartupMatch[] }> {
  const groups = new Map<RootCauseCategory, StartupMatch[]>();
  for (const m of matches) {
    if (m.rootCauseCategory === "unknown") continue;
    const list = groups.get(m.rootCauseCategory) ?? [];
    list.push(m);
    groups.set(m.rootCauseCategory, list);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([category, members]) => ({ category, members }));
}

/**
 * Compose the report. Markdown out, same as the contract always promised.
 *
 * Degrades honestly: no matches says so, one match says so, and matches that
 * died of different things are reported as different rather than forced into a
 * pattern that is not there. A manufactured pattern is worse than none — it is
 * the exact failure that makes a judge stop trusting the rest of the page.
 */
export function composeReport(query: string, matches: StartupMatch[]): string {
  const out: string[] = [];

  out.push("## The idea as we read it", "", `> ${query.trim()}`, "");

  if (matches.length === 0) {
    out.push(
      "## Nothing in the graveyard matches this",
      "",
      "No company in the corpus is close enough to this idea to be worth citing.",
      "That is a statement about our records, not a verdict on the idea — we hold",
      "a curated set of failures, not every failure.",
    );
    return out.join("\n");
  }

  out.push("## Who already tried it", "");
  for (const m of matches) {
    const bullet = `- **${m.name}** (${lifespan(m)}) — ${sentence(m.tagline)}`;
    out.push(
      known(m.rootCause)
        ? `${bullet} Died of: ${firstSentence(m.rootCause)}`
        : `${bullet} Cause unrecorded.`,
    );
  }
  out.push("");

  const shared = sharedCategories(matches);
  out.push("## The pattern", "");

  if (matches.length === 1) {
    out.push(
      "Only one company in the corpus matched, so there is no pattern to report —",
      "one data point is an anecdote. Treat the entry above as a lead to research,",
      "not as evidence.",
    );
  } else if (shared.length === 0) {
    const causes = [...new Set(matches.map((m) => m.rootCauseCategory))].filter(
      (c) => c !== "unknown",
    );

    if (causes.length === 0) {
      // Nothing is categorised. We know NOTHING about whether they share a
      // cause, so we must not say they differ — that is an assertion the data
      // does not support, and it is the same fabrication as inventing a shared
      // pattern, just pointing the other way.
      out.push(
        "We cannot say. None of these companies has a categorised cause on record,",
        "so there is no basis here for claiming they died of the same thing or of",
        "different things. Read the individual causes above and judge for yourself.",
      );
    } else if (causes.length === 1) {
      // One cause on record and no cluster means exactly one match is
      // categorised. "No single trap explains them" would be nonsense.
      out.push(
        `Only one of these has a categorised cause on record: *${causes[0]}*.`,
        "That is too little to call a pattern either way.",
      );
    } else {
      out.push(
        "These companies did not die of the same thing.",
        `The causes on record are ${causes.map((c) => `*${c}*`).join(", ")} — no single trap explains them.`,
        "",
        "That is worth knowing on its own: a space where everyone failed differently",
        "is a harder space than one with a single obvious trap to avoid.",
      );
    }
  } else {
    const top = shared[0];
    const names = top.members.map((m) => m.name).join(", ");
    out.push(
      `${top.members.length} of your ${matches.length} matches died of the same thing: **${top.category}**.`,
      "",
      `That is ${names}.`,
    );
    for (const rest of shared.slice(1)) {
      out.push(
        "",
        `A second cluster died of **${rest.category}**: ${rest.members
          .map((m) => m.name)
          .join(", ")}.`,
      );
    }
  }

  const timing = matches.filter((m) => known(m.timingNote));
  if (timing.length > 0) {
    out.push("", "### On timing", "");
    for (const m of timing) out.push(`- **${m.name}** — ${m.timingNote}`);
  }

  const lessons = [...new Set(matches.filter((m) => known(m.lesson)).map((m) => m.lesson))];
  if (lessons.length > 0) {
    out.push("", "## What would have to be different", "");
    for (const lesson of lessons) out.push(`- ${lesson}`);
  }

  return out.join("\n");
}
