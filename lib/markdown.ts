/**
 * A tokenizer for the Markdown subset that lib/report.ts actually emits.
 * Owner: Yeriel.
 *
 * Deliberately not a Markdown library. `composeReport()` is a pure function we
 * wrote, so the grammar it produces is closed and known: `##`, `###`, `>`,
 * `- `, `**bold**`, `*italic*`, and paragraphs that wrap across source lines.
 * Pulling in a parser for that would ship a CommonMark engine to render six
 * constructs, and would happily render any HTML the corpus smuggled in.
 *
 * Pure, and React-free on purpose: app/components/Markdown.tsx renders the
 * tokens, and scripts/check.ts can assert on them without a DOM.
 */

/** A run of text with at most one emphasis applied. */
export type Span = { text: string; bold?: boolean; italic?: boolean };

export type Block =
  | { kind: "h2" | "h3" | "p" | "quote"; spans: Span[] }
  | { kind: "list"; items: Span[][] };

/**
 * Split one line into emphasis runs.
 *
 * `**` is matched before `*` by alternation order, so "**bold**" never parses
 * as an italic containing a stray asterisk.
 *
 * Emphasis must be TIGHT: the opening marker is followed by a non-space and
 * the closing marker preceded by one, the same rule CommonMark uses. Without
 * it, "2 * 3 * 4" parses as an italic " 3 " and both asterisks disappear.
 * That reaches real output, because composeReport() echoes the founder's raw
 * query back inside a blockquote, and an idea containing arithmetic or a
 * literal asterisk would come back with characters missing. Loose markers are
 * now left as literal text: showing an asterisk beats silently eating one.
 */
export function parseInline(line: string): Span[] {
  const spans: Span[] = [];
  const re = /\*\*(\S(?:[^*]*\S)?)\*\*|\*(\S(?:[^*]*\S)?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(line)) !== null) {
    if (m.index > last) spans.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else spans.push({ text: m[2], italic: true });
    last = re.lastIndex;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  return spans;
}

/**
 * Group lines into blocks.
 *
 * Consecutive plain lines join into one paragraph with a space, because
 * composeReport() hard-wraps its prose at source level. Rendering each source
 * line as its own paragraph would put a blank line between every clause.
 */
export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let items: string[] = [];

  const flush = () => {
    if (para.length > 0) {
      blocks.push({ kind: "p", spans: parseInline(para.join(" ")) });
      para = [];
    }
    if (quote.length > 0) {
      blocks.push({ kind: "quote", spans: parseInline(quote.join(" ")) });
      quote = [];
    }
    if (items.length > 0) {
      blocks.push({ kind: "list", items: items.map(parseInline) });
      items = [];
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flush();
    } else if (line.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", spans: parseInline(line.slice(4)) });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", spans: parseInline(line.slice(3)) });
    } else if (line.startsWith("> ")) {
      if (para.length > 0 || items.length > 0) flush();
      quote.push(line.slice(2));
    } else if (line.startsWith("- ")) {
      if (para.length > 0 || quote.length > 0) flush();
      items.push(line.slice(2));
    } else {
      if (quote.length > 0 || items.length > 0) flush();
      para.push(line.trim());
    }
  }

  flush();
  return blocks;
}
