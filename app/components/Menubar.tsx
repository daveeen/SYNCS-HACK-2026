"use client";

import { useSyncExternalStore } from "react";

/* --------------------------------------------------------------------------
   The clock, as an external store.

   The obvious version, useState(null) plus a setState in an effect, is what the
   React Compiler lint flags: a synchronous setState in an effect body forces a
   second render pass on every mount. useSyncExternalStore is the shape React
   provides for exactly this, a value that lives outside React and changes on
   its own schedule.

   The server snapshot is the empty string. Server and client cannot agree on
   what time it is, so the markup deliberately renders no time at all until
   hydration, and the reserved width below keeps the strip from reflowing when
   it arrives.

   getSnapshot MUST return a cached string. Formatting a fresh Date on every
   call returns a new value each time React checks, which it reads as "changed
   again" and loops forever.
   -------------------------------------------------------------------------- */

function format(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

let cachedTime = "";
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    cachedTime = format(new Date());
    timer = setInterval(() => {
      const next = format(new Date());
      // Only wake React when the displayed minute actually changes.
      if (next === cachedTime) return;
      cachedTime = next;
      for (const l of listeners) l();
    }, 15_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => cachedTime;
const getServerSnapshot = () => "";

/**
 * The menubar. Half of what makes a screen read as macOS is simply this
 * strip being there, so it earns its 26px.
 *
 * It carries only things that are true: the app name, what is currently
 * focused, how many companies are in the trash, and the clock. No dead menu
 * titles that open nothing.
 */
export default function Menubar({ focused, count }: { focused: string | null; count: number }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
      <div style={{ ...cell, minWidth: 0, flex: "1 1 auto" }}>
        <span style={{ fontWeight: 600, color: "var(--gy-ink)", fontSize: "var(--gy-t-ui)", flex: "0 0 auto" }}>
          Archived
        </span>
        {/* The focused window's title can be a company name or a whole query.
            Truncate rather than push the clock off the strip. */}
        {focused && (
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {focused}
          </span>
        )}
      </div>

      <div style={{ ...cell, flex: "0 0 auto" }}>
        <span className="gy-hide-narrow" style={{ fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-micro)", whiteSpace: "nowrap" }}>
          {count} in the trash
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 62, textAlign: "right" }}>
          {now}
        </span>
      </div>
    </div>
  );
}
