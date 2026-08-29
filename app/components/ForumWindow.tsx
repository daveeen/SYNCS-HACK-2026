"use client";

/* ==========================================================================
   FORUM — Sam's canvas.
   --------------------------------------------------------------------------
   Intentionally empty. The dock item, the window chrome, the sizing and the
   open/close/zoom wiring are all done, so this file is the only thing that
   needs to change: replace the placeholder below with the real forum.

   What you already get for free, no plumbing required:
     - opens from the dock, and from nothing else
     - draggable, closable (red), collapsible (amber), zoomable (green)
     - Escape closes it while focused
     - the body scrolls internally at any window size
     - design tokens in app/globals.css (--gy-*)

   Window size is set in Desktop.tsx › SIZES.forum if you want it bigger.
   ========================================================================== */

export default function ForumWindow() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "var(--gy-t-ui)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--gy-ink-faint)",
        }}
      >
        Forum goes here
      </p>
    </div>
  );
}
