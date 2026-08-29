"use client";

import type { DeskDoc } from "@/lib/desktop-content";

/** A plain text document out of one of the desktop folders. */
export default function DocWindow({ doc }: { doc: DeskDoc }) {
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-6)", maxWidth: "62ch" }}>
      {doc.body.map((p, i) => (
        <p
          key={i}
          style={{
            margin: 0,
            fontSize: i === 0 ? "var(--gy-t-lead)" : "var(--gy-t-body)",
            lineHeight: 1.6,
            color: i === 0 ? "var(--gy-ink)" : "var(--gy-ink-dim)",
          }}
        >
          {p}
        </p>
      ))}
    </article>
  );
}
