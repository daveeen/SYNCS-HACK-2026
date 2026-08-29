/**
 * THE SHARED DATA CONTRACT.
 *
 * Owner: Yeriel. Tie-breaker on changes: Darryl.
 * Everyone imports from here — never redefine these shapes locally.
 * If you need to change `FailedStartup` or `SearchResponse`, announce it in
 * team chat FIRST (see CLAUDE.md rule 5). The mock JSON, the pipeline output
 * and every UI component depend on them.
 */

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
  /** The disease, e.g. "no product-market fit". */
  rootCause: string;
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
};

/** Every route handler returns this shape on failure. */
export type ApiError = { error: string };
