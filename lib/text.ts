/**
 * Display-layer text cleanup. Owner: Yeriel.
 *
 * The corpus carries 166 en and em dashes across user-facing fields: 112 in
 * `timingNote`, 33 in `rootCause`, 2 in `proximateCause`. They render straight
 * into the UI and break CLAUDE.md design rule 9, which is about copy.
 *
 * Fixed HERE rather than in data/startups.enriched.json on purpose. The data is
 * Asher's and every field is QA'd against its sources; a sweeping regex over
 * 173 records would touch prose nobody re-read afterwards. This is a rendering
 * decision, so it lives at the point of rendering, and the stored record is
 * still exactly what was verified.
 */

/**
 * Replace em and en dashes with plain punctuation.
 *
 * Ranges first, then everything else:
 *
 *   - Between digits ("2013–2016") is a range, so it becomes the hyphen the
 *     rest of the UI already uses for year spans.
 *   - Anything else is punctuation doing the work of a comma, whether it is
 *     spaced ("a problem — the category was growing") or tight, which is the
 *     form Haiku favours ("the economics of speed—faster delivery—can work").
 *
 * A compound word keeps its hyphen: "cook-and-deliver" is a hyphen-minus, not
 * an em or en dash, and never matches either branch.
 *
 * Also applied to Claude's output. The prompt asks it not to use dashes and it
 * does anyway, about twenty times per report, so the rule is enforced in code
 * rather than merely requested.
 */
export function plainDashes(text: string): string {
  // [^\S\r\n] is "whitespace that is not a line break". Plain \s would eat the
  // newline after a trailing dash, and this runs over Claude's Markdown before
  // it is cached: one dash at the end of a line would pull the next "##"
  // heading onto the same line as prose and cache the wreckage forever.
  const SP = "[^\\S\\r\\n]*";
  return text
    .replace(new RegExp(`(\\d)${SP}[—–]${SP}(\\d)`, "g"), "$1-$2")
    .replace(new RegExp(`${SP}[—–]${SP}`, "g"), ", ");
}
