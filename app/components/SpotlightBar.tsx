"use client";

import { useEffect, useRef, useState } from "react";

/* ==========================================================================
   SPOTLIGHT — the entry point for the core product flow.
   --------------------------------------------------------------------------
   WIRED. `Desktop.tsx` passes `onSubmit={runSearch}`, which calls
   POST /api/search and then POST /api/report, and renders both into
   ResultsWindow. This file is still presentation only: it owns the input and
   nothing else, and the `onSubmit`-absent branch below stays as the honest
   fallback for any surface that mounts the bar without a handler.

   Two things a future reader needs, because the old note here was wrong:

   - /api/search returns `report: ""` ALWAYS. The write-up comes from the
     separate /api/report call, which streams text/plain Markdown rather than
     returning JSON. Do not read `data.report`.
   - The rails to check are `x-graveyard-mock-data` and `x-graveyard-degraded`.
     There is no `x-graveyard-stub` header; no route has ever emitted one.
     app/api/README.md is the spec for both of the real ones.
   ========================================================================== */

export default function SpotlightBar({
  onSubmit,
}: {
  /** Receives the raw query. Absent means search is not connected yet. */
  onSubmit?: (query: string) => void;
}) {
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  // Cmd+K focuses the bar. Cmd+Space belongs to the real Spotlight and
  // cannot be taken from the OS, so we do not pretend to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    if (onSubmit) { setNote(null); onSubmit(query); return; }
    setNote("Search is not connected yet.");
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      style={{ width: "min(680px, 82vw)", display: "flex", flexDirection: "column", gap: "var(--gy-s-4)" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--gy-s-5)",
          // Shrinks on a short screen, where 60px of bar plus the masthead and
          // four icons is more than the ground has.
          height: "clamp(48px, 7vh, 60px)",
          padding: "0 clamp(var(--gy-s-6), 3vw, var(--gy-s-8))",
          borderRadius: 14,
          // The glass: dark, heavily blurred, letting the wallpaper through.
          background: "rgba(38, 40, 44, 0.52)",
          backdropFilter: "saturate(180%) blur(30px)",
          WebkitBackdropFilter: "saturate(180%) blur(30px)",
          border: "1px solid rgba(255, 255, 255, 0.20)",
          boxShadow:
            "0 16px 44px rgba(0, 18, 40, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "0 0 auto" }}>
          <circle cx="10.5" cy="10.5" r="6.6" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.1" />
          <path d="M15.6 15.6 L21 21" stroke="rgba(255,255,255,0.9)" strokeWidth="2.1" strokeLinecap="round" />
        </svg>

        <input
          ref={ref}
          value={q}
          onChange={(e) => { setQ(e.target.value); if (note) setNote(null); }}
          placeholder="Describe your startup idea"
          aria-label="Describe your startup idea to find companies that already tried it"
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            height: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#ffffff",
            fontFamily: "var(--gy-font-ui)",
            // Never below 16px: iOS Safari zooms the whole page when a focused
            // input's text is smaller than that, and the desktop metaphor does
            // not survive being zoomed.
            fontSize: "clamp(16px, 4.4vw, 21px)",
            letterSpacing: "-0.01em",
          }}
        />

        {/* A keyboard hint is meaningless on a device with no keyboard. */}
        <kbd
          className="gy-hide-narrow"
          style={{
            flex: "0 0 auto",
            fontFamily: "var(--gy-font-mono)",
            fontSize: 11,
            color: "rgba(255, 255, 255, 0.55)",
            border: "1px solid rgba(255, 255, 255, 0.22)",
            borderRadius: 5,
            padding: "3px 7px",
          }}
        >
          ⌘K
        </kbd>
      </div>

      {note && (
        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: "var(--gy-t-meta)",
            color: "rgba(255, 255, 255, 0.85)",
            textShadow: "0 1px 4px rgba(0, 24, 48, 0.5)",
          }}
        >
          {note}
        </p>
      )}
    </form>
  );
}
