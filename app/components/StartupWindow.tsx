"use client";

import type { FailedStartup } from "@/lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-2)" }}>
      <span style={{ fontSize: "var(--gy-t-micro)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gy-ink-faint)" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--gy-t-body)", color: "var(--gy-ink)", lineHeight: 1.5 }}>{children}</span>
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
            fontSize: "var(--gy-t-epitaph)",
            lineHeight: 1.05,
            color: "var(--gy-ink)",
          }}
        >
          {s.name}
        </h1>
        <p style={{ margin: 0, fontSize: "var(--gy-t-lead)", color: "var(--gy-ink-dim)", lineHeight: 1.45 }}>
          {s.tagline}
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
        {s.description}
      </p>

      {/* The centrepiece: symptom next to disease. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--gy-s-7)",
          padding: "var(--gy-s-7)",
          background: "var(--gy-surface-sink)",
          border: "1px solid var(--gy-line-soft)",
          borderRadius: "var(--gy-r-field)",
          boxShadow: "var(--gy-e-inset)",
        }}
      >
        <Field label="Proximate cause (symptom)">{s.proximateCause}</Field>
        <Field label="Root cause (disease)">
          <span style={{ color: "var(--gy-dead)" }}>{s.rootCause}</span>
        </Field>
      </div>

      {s.timingNote && s.timingNote !== "unknown" && <Field label="Timing">{s.timingNote}</Field>}

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
          {s.lesson}
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
