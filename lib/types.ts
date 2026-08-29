/**
 * THE SHARED DATA CONTRACT.
 *
 * Owner: Yeriel. Tie-breaker on changes: Darryl.
 * Everyone imports from here — never redefine these shapes locally.
 * If you need to change `FailedStartup` or `SearchResponse`, announce it in
 * team chat FIRST (see CLAUDE.md rule 5). The mock JSON, the pipeline output
 * and every UI component depend on them.
 */

/**
 * The controlled vocabulary for grouping failures, from the CB Insights
 * taxonomy (see docs/research.md and the team plan's appendix).
 *
 * This exists because `/api/report` groups matches to find a shared pattern,
 * and you cannot group free text. `rootCause` stays free text because it reads
 * better on a tombstone card; `rootCauseCategory` is what the grouping runs on.
 * Both, not either — the choice docs/research.md posed as either/or costs one
 * field to have both ways.
 */
export const ROOT_CAUSE_CATEGORIES = [
  "no market need",
  "ran out of cash",
  "wrong team",
  "out-competed",
  "pricing or unit economics",
  "poor product",
  "no business model",
  "bad timing",
  "regulatory",
  "unknown",
] as const;

export type RootCauseCategory = (typeof ROOT_CAUSE_CATEGORIES)[number];

/** One dead startup. Matches every record in data/startups.*.json. */
export type FailedStartup = {
  id: string;
  name: string;
  tagline: string;
  /** What they did, plain English. */
  description: string;
  industry: string;
  foundedYear: number;
  diedYear: number;
  /** e.g. "$3.2M" or "unknown". */
  fundingRaised: string;
  /** The symptom, e.g. "ran out of cash". */
  proximateCause: string;
  /** The disease, in the record's own words. Free text — reads well on a card. */
  rootCause: string;
  /** The same disease, bucketed. What /api/report groups on. */
  rootCauseCategory: RootCauseCategory;
  /** Was it timing? e.g. "too early — pre-smartphone". */
  timingNote: string;
  /** The one-line takeaway. */
  lesson: string;
  /** Real URLs — NEVER leave empty on a real entry. */
  sources: string[];
  /** Wayback snapshot of their old site, if any. "" if none. */
  waybackUrl: string;
};

/** A match is a startup plus how close it is to the user's idea (0..1). */
export type StartupMatch = FailedStartup & { similarity: number };

/**
 * Precomputed corpus vectors, keyed by startup id. Lives in its own file
 * (data/startups.vectors.json) rather than joined onto FailedStartup: ~55 x 384
 * floats is around 420KB, and keeping it separate leaves the enriched file
 * readable for QA and makes it impossible to leak vectors to the browser.
 */
export type StartupVectors = Record<string, number[]>;

/** Where a Wayback snapshot came from. */
export type ReconstructSource = "baked" | "live" | "none";

/** Response shape of POST /api/search. */
export type SearchResponse = {
  query: string;
  matches: StartupMatch[];
  /** Claude's diligence write-up for THIS idea. Markdown. */
  report: string;
};

/* ------------------------------------------------------------------ *
 * Supporting request/response types.
 * These are NOT part of the frozen contract above — they describe the
 * route handlers' inputs and the two secondary endpoints. Changing them
 * is a normal PR; changing the two types above is not.
 * ------------------------------------------------------------------ */

export type SearchRequest = {
  /** The founder's pasted startup idea. */
  query: string;
  /** How many matches to return. Default 5. */
  limit?: number;
};

export type ReportRequest = {
  query: string;
  /** The matches the report should reason over. */
  matches: StartupMatch[];
};

export type ReportResponse = {
  query: string;
  /** Markdown. */
  report: string;
};

export type ReconstructRequest = {
  /** Domain or URL of the dead startup, e.g. "webvan.com". */
  url: string;
  /** Preferred snapshot year, e.g. 2016. Optional. */
  year?: number;
};

export type ReconstructResponse = {
  url: string;
  /** Wayback snapshot URL, or null if the archive has nothing. */
  snapshotUrl: string | null;
  /** Wayback timestamp, e.g. "20160421075323". */
  timestamp: string | null;
  available: boolean;
  /** Baked into the record at pipeline time, resolved live, or absent. */
  source: ReconstructSource;
};

/* ------------------------------------------------------------------ *
 * Forum. Rows as stored in Supabase; snake_case because that is what
 * PostgREST returns and translating it would only create two vocabularies.
 * ------------------------------------------------------------------ */

/** A forum account's public identity. auth.users holds the credentials. */
export type Profile = {
  id: string;
  handle: string;
  created_at: string;
};

/** A forum post as stored. */
export type ForumPost = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
};

/** A forum comment. `parent_id` gives one level of nesting. */
export type ForumComment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
};

/** Every route handler returns this shape on failure. */
export type ApiError = { error: string };
