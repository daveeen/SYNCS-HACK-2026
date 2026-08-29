"use client";

import { useEffect, useState } from "react";

/**
 * The menubar. Half of what makes a screen read as macOS is simply this
 * strip being there, so it earns its 26px.
 *
 * It carries only things that are true: the app name, what is currently
 * focused, how many companies are in the trash, and the clock. No dead menu
 * titles that open nothing.
 */
export default function Menubar({ focused, count }: { focused: string | null; count: number }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Mount-only, so server and client markup cannot disagree on the time.
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const cell: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--gy-s-5)",
    fontSize: "var(--gy-t-meta)",
    color: "var(--gy-ink-dim)",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "var(--gy-menubar-h)",
        zIndex: "var(--gy-z-menubar)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--gy-s-6)",
        background: "var(--gy-chrome)",
        backdropFilter: "var(--gy-blur)",
        WebkitBackdropFilter: "var(--gy-blur)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.35)",
        boxShadow: "0 1px 0 rgba(0, 0, 0, 0.06)",
        userSelect: "none",
      }}
    >
      <div style={cell}>
        <span style={{ fontWeight: 600, color: "var(--gy-ink)", fontSize: "var(--gy-t-ui)" }}>
          Archived
        </span>
        {focused && <span>{focused}</span>}
      </div>

      <div style={cell}>
        <span style={{ fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-micro)" }}>
          {count} in the trash
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 62, textAlign: "right" }}>
          {now
            ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : ""}
        </span>
      </div>
    </div>
  );
}
