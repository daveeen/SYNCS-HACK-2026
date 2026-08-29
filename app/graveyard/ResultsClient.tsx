"use client";

/**
 * PLACEHOLDER results renderer. Owner: Sam (tombstone cards, report display).
 *
 * Everything below is throwaway markup whose only job is to prove /api/search
 * responds with the contract shape. Replace it wholesale — but keep three
 * behaviours, because they are load-bearing:
 *
 *   1. the stub badge (we must never demo faked output unaware)
 *   2. a real loading state (Claude Opus reports are slow)
 *   3. a real error state (the demo must degrade, not blank out)
 */
import { useEffect, useState } from "react";
import type { SearchResponse, StartupMatch } from "@/lib/types";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: SearchResponse; stubbed: boolean };

/**
 * NOTE: the parent renders this with `key={query}`, so a new query remounts the
 * component and resets state to "loading" for free. That is why this effect
 * never sets loading itself — doing so synchronously in the effect body causes
 * a cascading render and trips react-hooks/set-state-in-effect.
 */
export function ResultsClient({ query }: { query: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setState({
          status: "ready",
          data: json as SearchResponse,
          stubbed: res.headers.get("x-graveyard-stub") === "true",
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "search failed",
        });
      }
    })();

    return () => controller.abort();
  }, [query]);

  if (state.status === "loading") {
    return <p className="text-muted">Digging…</p>;
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
        Search failed: {state.message}
      </p>
    );
  }

  const { matches, report } = state.data;

  return (
    <div className="space-y-8">
      {state.stubbed && (
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          <strong className="font-semibold">Stubbed API.</strong> Matches are
          keyword-ranked, not semantically matched, and the report below did not
          come from Claude.
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          {matches.length} match{matches.length === 1 ? "" : "es"}
        </h2>
        {matches.length === 0 ? (
          <p className="text-muted">Nothing in the graveyard matched. Lucky you.</p>
        ) : (
          <ul className="space-y-4">
            {matches.map((m) => (
              <TombstonePlaceholder key={m.id} match={m} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Report
        </h2>
        {/* TODO(Sam): render as Markdown. Raw text is fine for scaffold. */}
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-black/30 p-4 font-mono text-sm text-muted">
          {report}
        </pre>
      </section>
    </div>
  );
}

function TombstonePlaceholder({ match }: { match: StartupMatch }) {
  return (
    <li className="rounded-md border border-border bg-black/30 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xl font-semibold">{match.name}</h3>
        <span className="font-mono text-sm text-muted">
          {match.foundedYear}–{match.diedYear} · {(match.similarity * 100).toFixed(0)}%
        </span>
      </div>
      <p className="mt-1 text-muted">{match.tagline}</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="inline font-medium text-muted">Proximate cause: </dt>
          <dd className="inline">{match.proximateCause}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-muted">Root cause: </dt>
          <dd className="inline">{match.rootCause}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-muted">Lesson: </dt>
          <dd className="inline">{match.lesson}</dd>
        </div>
      </dl>
    </li>
  );
}
