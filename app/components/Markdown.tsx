"use client";

import { useMemo } from "react";
import { parseMarkdown, type Span } from "@/lib/markdown";

/**
 * Renders the report Markdown that POST /api/report returns.
 *
 * Text only, by construction: the tokenizer in lib/markdown.ts emits spans and
 * blocks, never HTML, so nothing in the corpus can inject markup through the
 * report. Typography follows the same roles as StartupWindow: Newsreader for
 * headings and the pulled quote, Plex Sans for body.
 */

function spans(list: Span[]) {
  return list.map((s, i) => {
    if (s.bold) {
      return (
        <strong key={i} style={{ fontWeight: 600, color: "var(--gy-ink)" }}>
          {s.text}
        </strong>
      );
    }
    if (s.italic) {
      return (
        <em key={i} style={{ fontStyle: "italic" }}>
          {s.text}
        </em>
      );
    }
    return <span key={i}>{s.text}</span>;
  });
}

export default function Markdown({ markdown }: { markdown: string }) {
  // Dragging any window calls setWins on every pointermove, which re-renders
  // the whole Desktop tree. Without this the entire report is re-tokenised at
  // pointer-event rate, allocating a fresh block tree each frame.
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-6)", maxWidth: "64ch" }}>
      {blocks.map((b, i) => {
        if (b.kind === "h2") {
          return (
            <h2
              key={i}
              style={{
                margin: i === 0 ? 0 : "var(--gy-s-4) 0 0",
                fontFamily: "var(--gy-font-display)",
                fontWeight: 400,
                fontSize: "var(--gy-t-head)",
                lineHeight: 1.2,
                color: "var(--gy-ink)",
              }}
            >
              {spans(b.spans)}
            </h2>
          );
        }

        if (b.kind === "h3") {
          return (
            <h3
              key={i}
              style={{
                margin: "var(--gy-s-3) 0 0",
                fontSize: "var(--gy-t-micro)",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--gy-ink-faint)",
              }}
            >
              {spans(b.spans)}
            </h3>
          );
        }

        if (b.kind === "quote") {
          return (
            <blockquote
              key={i}
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
              {spans(b.spans)}
            </blockquote>
          );
        }

        if (b.kind === "list") {
          return (
            <ul
              key={i}
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "var(--gy-s-5)",
              }}
            >
              {b.items.map((item, j) => (
                <li
                  key={j}
                  style={{
                    position: "relative",
                    paddingLeft: "var(--gy-s-7)",
                    fontSize: "var(--gy-t-body)",
                    lineHeight: 1.6,
                    color: "var(--gy-ink-dim)",
                  }}
                >
                  {/* A hairline rule as the marker. A bullet glyph at this size
                      reads as a dot grid once five of them stack up. */}
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "0.7em",
                      width: 8,
                      height: 1,
                      background: "var(--gy-ink-faint)",
                    }}
                  />
                  {spans(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i} style={{ margin: 0, fontSize: "var(--gy-t-body)", lineHeight: 1.6, color: "var(--gy-ink-dim)" }}>
            {spans(b.spans)}
          </p>
        );
      })}
    </div>
  );
}
