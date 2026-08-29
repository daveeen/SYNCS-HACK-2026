"use client";

import type { StartupMatch } from "@/lib/types";
import { firstSentence, known } from "@/lib/report";
import { FolderGlyph } from "./FolderGlyph";
import Markdown from "./Markdown";

/* ==========================================================================
   RESULTS — what comes back when a founder types their idea into Spotlight.
   --------------------------------------------------------------------------
   Two calls, not one (docs/search-ux-flow.md §2): POST /api/search paints the
   matches, POST /api/report fills the write-up underneath them. Desktop.tsx
   owns the fetching and holds the state; this file only renders it.

   A failed report never discards the matches. They are independently useful,
   and dropping five real companies because a second request failed is the
   worst possible trade.
   ========================================================================== */

/** True when the route told us the answer is not the real thing. */
export type SearchFlags = {
  /** x-graveyard-mock-data: the companies are the ten invented ones. */
  mock: boolean;
  /** x-graveyard-degraded: embeddings failed, these are keyword matches. */
  degraded: boolean;
};

export type SearchState =
  | { kind: "idle" }
  | { kind: "searching"; query: string }
  // `empty` and `error` carry flags too. Without them, an embedder outage that
  // also returns nothing renders "Nothing in the archive tried this" with no
  // degraded banner: a confident claim about the archive when the real cause
  // is that semantic search fell over.
  | { kind: "empty"; query: string; flags: SearchFlags }
  | { kind: "error"; query: string; message: string; flags: SearchFlags }
  | { kind: "reporting"; query: string; matches: StartupMatch[]; flags: SearchFlags }
  | { kind: "complete"; query: string; matches: StartupMatch[]; flags: SearchFlags; report: string }
  | {
      kind: "report-failed";
      query: string;
      matches: StartupMatch[];
      flags: SearchFlags;
      message: string;
    };

/**
 * Below this, a "match" is noise dressed as a result.
 *
 * Calibrated against the live corpus rather than guessed. MiniLM cosine on
 * these 173 records scores a real hit at 0.48 to 0.51 ("meal delivery in under
 * 30 minutes" returns Sprig, Munchery, SpoonRocket), a loose but genuine
 * neighbour around 0.40, and something with no counterpart in the archive at
 * 0.17 to 0.24. 0.35 keeps the genuine neighbours and drops the noise.
 *
 * APPLIES TO COSINE SCORES ONLY. In degraded mode `lib/search.ts` returns BM25
 * ranks normalised by the top hit, so the best result is always exactly 1.00
 * however weak it is, and the rest are fractions of it. That file says it
 * outright: "These numbers are ranks, not cosines, never compare them against
 * a real similarity." Applying this floor to them would pass junk through at
 * 1.00 and cut real neighbours sitting at 0.3 of the leader.
 */
export const SIMILARITY_FLOOR = 0.35;

const LABEL: React.CSSProperties = {
  fontSize: "var(--gy-t-micro)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--gy-ink-faint)",
};

/** A card is tighter than a report bullet, so it takes a shorter cap. */
const CAUSE_CHARS = 150;

/** A banner for the two states where the answer must not be trusted. */
function Rail({ tone, children }: { tone: "bad" | "warn"; children: React.ReactNode }) {
  const colour = tone === "bad" ? "var(--gy-dead)" : "#8a6a1f";
  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: "var(--gy-s-4) var(--gy-s-6)",
        fontSize: "var(--gy-t-ui)",
        lineHeight: 1.45,
        color: colour,
        background: tone === "bad" ? "var(--gy-dead-dim)" : "rgba(190, 150, 40, 0.13)",
        border: `1px solid ${colour}`,
        borderRadius: "var(--gy-r-field)",
      }}
    >
      {children}
    </p>
  );
}

/** One matched company. Opens the full record, or the archived homepage. */
function MatchCard({
  m,
  showScore,
  onOpen,
  onOpenSite,
}: {
  m: StartupMatch;
  /** False in degraded mode, where `similarity` is a rank rather than a cosine. */
  showScore: boolean;
  onOpen: () => void;
  onOpenSite: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--gy-surface-sink)",
        border: "1px solid var(--gy-line-soft)",
        borderRadius: "var(--gy-r-field)",
        transition: "border-color var(--gy-dur-fast) var(--gy-ease)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--gy-line)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--gy-line-soft)"; }}
    >
      <button
        onClick={onOpen}
        style={{
          display: "flex",
          gap: "var(--gy-s-6)",
          width: "100%",
          textAlign: "left",
          padding: "var(--gy-s-6)",
          background: "transparent",
          border: "none",
          borderRadius: "var(--gy-r-field)",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
      <span style={{ flex: "0 0 auto", paddingTop: 2, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}>
        <FolderGlyph tone="dead" size={38} />
      </span>

      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--gy-s-2)" }}>
        <span
          style={{
            fontFamily: "var(--gy-font-display)",
            fontSize: "var(--gy-t-title)",
            lineHeight: 1.2,
            color: "var(--gy-ink)",
          }}
        >
          {m.name}
        </span>
        <span style={{ fontSize: "var(--gy-t-ui)", lineHeight: 1.4, color: "var(--gy-ink-dim)" }}>
          {m.tagline}
        </span>
        <span
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--gy-s-5)",
            fontFamily: "var(--gy-font-mono)",
            fontSize: "var(--gy-t-micro)",
            color: "var(--gy-ink-faint)",
            paddingTop: "var(--gy-s-1)",
          }}
        >
          <span>{m.foundedYear} to {m.diedYear}</span>
          {known(m.fundingRaised) && <span>{m.fundingRaised}</span>}
          <span>{m.industry}</span>
        </span>
        {known(m.rootCause) && (
          <span style={{ fontSize: "var(--gy-t-ui)", lineHeight: 1.45, color: "var(--gy-dead)", paddingTop: "var(--gy-s-2)" }}>
            {firstSentence(m.rootCause, CAUSE_CHARS)}
          </span>
        )}
      </span>

      {/* Similarity as the raw cosine, not a percentage. It is a distance
          between two sentence vectors, and "83% match" would dress that up as
          a confidence it never was. Hidden entirely in degraded mode, where
          the number is a normalised BM25 rank and the leader is always 1.00. */}
      {showScore && (
        <span style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--gy-s-2)" }}>
          <span style={{ fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-meta)", color: "var(--gy-ink-dim)" }}>
            {m.similarity.toFixed(2)}
          </span>
          <span aria-hidden="true" style={{ width: 44, height: 3, background: "var(--gy-line-soft)", borderRadius: "var(--gy-r-pill)" }}>
            <span
              style={{
                display: "block",
                width: `${Math.round(Math.min(Math.max(m.similarity, 0), 1) * 100)}%`,
                height: "100%",
                background: "var(--gy-live)",
                borderRadius: "var(--gy-r-pill)",
              }}
            />
          </span>
          <span style={{ ...LABEL, fontSize: 9 }}>match</span>
        </span>
      )}
      </button>

      {/* Outside the card button on purpose: a button inside a button is
          invalid HTML and the inner click never reaches the right handler. */}
      {m.waybackUrl && (
        <div style={{ padding: "0 var(--gy-s-6) var(--gy-s-6)", marginTop: "calc(-1 * var(--gy-s-3))" }}>
          <button
            onClick={onOpenSite}
            style={{
              padding: "var(--gy-s-2) var(--gy-s-5)",
              fontFamily: "var(--gy-font-ui)",
              fontSize: "var(--gy-t-meta)",
              color: "var(--gy-ink-dim)",
              background: "var(--gy-chrome-strong)",
              border: "1px solid var(--gy-line-soft)",
              borderRadius: "var(--gy-r-field)",
              cursor: "pointer",
            }}
          >
            Open their old homepage
          </button>
        </div>
      )}
    </div>
  );
}

/** Rule 21: a real loading state, because a frozen panel reads as broken. */
function ReportSkeleton() {
  const bar = (w: string, h: number) => (
    <span
      style={{
        display: "block",
        width: w,
        height: h,
        borderRadius: "var(--gy-r-pill)",
        background: "var(--gy-surface-sink)",
      }}
    />
  );
  return (
    <div aria-live="polite" aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-5)" }}>
      <span style={LABEL}>Reading the records</span>
      {bar("42%", 18)}
      {bar("100%", 10)}
      {bar("94%", 10)}
      {bar("70%", 10)}
    </div>
  );
}

export default function ResultsWindow({
  state,
  onOpenStartup,
  onOpenSite,
  onRetryReport,
}: {
  state: SearchState;
  onOpenStartup: (m: StartupMatch) => void;
  onOpenSite: (m: StartupMatch) => void;
  onRetryReport: () => void;
}) {
  if (state.kind === "idle") return null;

  const query = state.query;
  const matches = "matches" in state ? state.matches : [];
  const flags = "flags" in state ? state.flags : { mock: false, degraded: false };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-8)" }}>
      {/* Never let an invented corpus or a downgraded ranker reach a judge
          without saying so. app/api/README.md is the spec for both headers. */}
      {flags.mock && (
        <Rail tone="bad">
          These companies are invented placeholders from the mock file, not real
          failures. Run the data pipeline before showing this to anyone.
        </Rail>
      )}
      {flags.degraded && (
        <Rail tone="warn">
          Semantic search is unavailable, so these are keyword matches. They are
          real companies, ranked by word overlap rather than meaning.
        </Rail>
      )}

      <header style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-3)" }}>
        <span style={LABEL}>Your idea</span>
        <p style={{ margin: 0, fontFamily: "var(--gy-font-display)", fontSize: "var(--gy-t-title)", lineHeight: 1.4, color: "var(--gy-ink)" }}>
          {query}
        </p>
      </header>

      {state.kind === "searching" && (
        <p aria-live="polite" style={{ margin: 0, fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>
          Searching the archive.
        </p>
      )}

      {state.kind === "error" && (
        <Rail tone="bad">{state.message}</Rail>
      )}

      {state.kind === "empty" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-5)" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--gy-font-display)", fontWeight: 400, fontSize: "var(--gy-t-head)", color: "var(--gy-ink)" }}>
            Nothing in the archive tried this
          </h2>
          <p style={{ margin: 0, fontSize: "var(--gy-t-body)", lineHeight: 1.6, color: "var(--gy-ink-dim)", maxWidth: "58ch" }}>
            No company we hold is close enough to your idea to be worth citing.
            That is a fact about our records, not a verdict on the idea. We keep
            a curated set of failures, not every failure ever filed.
          </p>
        </div>
      )}

      {matches.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-5)" }}>
          <span style={LABEL}>
            {matches.length} {matches.length === 1 ? "company" : "companies"} already tried it
          </span>
          {matches.map((m) => (
            <MatchCard
              key={m.id}
              m={m}
              showScore={!flags.degraded}
              onOpen={() => onOpenStartup(m)}
              onOpenSite={() => onOpenSite(m)}
            />
          ))}
        </section>
      )}

      {state.kind === "reporting" && <ReportSkeleton />}

      {state.kind === "complete" && <Markdown markdown={state.report} />}

      {state.kind === "report-failed" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "var(--gy-s-5)" }}>
          <Rail tone="warn">
            The write-up did not load. {state.message} The matches above are
            unaffected.
          </Rail>
          <button
            onClick={onRetryReport}
            style={{
              padding: "var(--gy-s-3) var(--gy-s-7)",
              fontSize: "var(--gy-t-ui)",
              fontFamily: "var(--gy-font-ui)",
              color: "var(--gy-ink)",
              background: "var(--gy-chrome-strong)",
              border: "1px solid var(--gy-line)",
              borderRadius: "var(--gy-r-field)",
              boxShadow: "var(--gy-e-object)",
              cursor: "pointer",
            }}
          >
            Try the write-up again
          </button>
        </div>
      )}
    </div>
  );
}
