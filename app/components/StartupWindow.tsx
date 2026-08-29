"use client";

import { plainDashes } from "@/lib/text";
import type { FailedStartup } from "@/lib/types";

function Field({
  label,
  accent = false,
  children,
}: {
  label: string;
  /** Colour the LABEL, not the prose. See the root-cause block below. */
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-2)" }}>
      <span
        style={{
          fontSize: "var(--gy-t-micro)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: accent ? "var(--gy-dead)" : "var(--gy-ink-faint)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "var(--gy-t-body)", color: "var(--gy-ink)", lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

/** One dead company, opened out of the trash. */
export default function StartupWindow({ s }: { s: FailedStartup }) {
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-8)" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-3)" }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--gy-font-display)",
            fontWeight: 400,
            fontSize: "clamp(26px, 7vw, var(--gy-t-epitaph))",
            lineHeight: 1.05,
            color: "var(--gy-ink)",
            wordBreak: "break-word",
          }}
        >
          {s.name}
        </h1>
        <p style={{ margin: 0, fontSize: "var(--gy-t-lead)", color: "var(--gy-ink-dim)", lineHeight: 1.45 }}>
          {plainDashes(s.tagline)}
        </p>
        <div
          style={{
            display: "flex", flexWrap: "wrap", gap: "var(--gy-s-5)",
            fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-meta)",
            color: "var(--gy-ink-faint)", paddingTop: "var(--gy-s-2)",
          }}
        >
          <span>{s.foundedYear} to {s.diedYear}</span>
          <span>{s.diedYear - s.foundedYear} yrs</span>
          <span>{s.fundingRaised}</span>
          <span>{s.industry}</span>
        </div>
      </header>

      <p style={{ margin: 0, fontSize: "var(--gy-t-body)", lineHeight: 1.6, color: "var(--gy-ink-dim)" }}>
        {plainDashes(s.description)}
      </p>

      {/* The centrepiece: symptom above disease.
          Stacked, not side by side. Equal columns looked balanced in the
          abstract and never in practice: proximateCause is a clause and
          rootCause averages 440 characters, so one column ran eight lines
          beside a column that ran one. Stacking also means it does not need to
          reflow on a narrow window, because it was already one column. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--gy-s-7)",
          padding: "clamp(var(--gy-s-5), 3vw, var(--gy-s-7))",
          background: "var(--gy-surface-sink)",
          border: "1px solid var(--gy-line-soft)",
          borderRadius: "var(--gy-r-field)",
          boxShadow: "var(--gy-e-inset)",
        }}
      >
        <Field label="Proximate cause (symptom)">{plainDashes(s.proximateCause)}</Field>
        <span style={{ height: 1, background: "var(--gy-line-soft)" }} />
        {/* The rust marks the heading, not the paragraph. An accent colour set
            over eight lines of 13px body text is an accent doing body work, and
            it reads as a warning rather than as prose. */}
        <Field label="Root cause (disease)" accent>
          {plainDashes(s.rootCause)}
        </Field>
      </div>

      {s.timingNote && s.timingNote !== "unknown" && <Field label="Timing">{plainDashes(s.timingNote)}</Field>}

      {s.lesson && (
        <blockquote
          style={{
            margin: 0,
            paddingLeft: "var(--gy-s-7)",
            borderLeft: "2px solid var(--gy-live-dim)",
            fontFamily: "var(--gy-font-display)",
            fontSize: "var(--gy-t-title)",
            fontStyle: "italic",
            lineHeight: 1.45,
            color: "var(--gy-ink)",
          }}
        >
          {plainDashes(s.lesson)}
        </blockquote>
      )}

      <footer style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-3)" }}>
        <span style={{ fontSize: "var(--gy-t-micro)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gy-ink-faint)" }}>
          Sources
        </span>
        {s.sources.length === 0 ? (
          <span style={{ fontSize: "var(--gy-t-ui)", color: "var(--gy-ink-faint)" }}>unknown</span>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--gy-s-2)" }}>
            {s.sources.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-meta)", color: "var(--gy-live)", wordBreak: "break-all" }}
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        )}
        {s.waybackUrl && (
          <a
            href={s.waybackUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-meta)", color: "var(--gy-ink-dim)", marginTop: "var(--gy-s-2)" }}
          >
            View their old site in the Wayback Machine
          </a>
        )}
      </footer>
    </article>
  );
}
