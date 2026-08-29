/**
 * The "do not demo this" badge. Owner: Darryl.
 *
 * Visible whenever the app is serving invented companies from
 * data/startups.mock.json. It disappears on its own once the pipeline writes
 * real records into data/startups.enriched.json.
 *
 * Do not delete this to make a screenshot look better. Presenting fabricated
 * failure data as real is the single fastest way to lose the Idea and Pitch
 * marks (CLAUDE.md rule 3).
 */
export function MockDataBanner() {
  return (
    <div
      role="status"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      <strong className="font-semibold">Mock data.</strong> These companies are
      invented placeholders, not real failed startups. Real records land once
      the pipeline writes <code className="font-mono">data/startups.enriched.json</code>.
    </div>
  );
}
