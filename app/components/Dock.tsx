"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A magnifying dock.
 *
 * Real macOS-style magnification: every item scales by its distance from the
 * pointer along the dock's x axis, with a cosine falloff, so the neighbours
 * swell too and the strip reads as one elastic surface. Hovering a single
 * item and scaling only that one (which is what most web docks do) looks
 * mechanical by comparison.
 *
 * This is affordance, not decoration: the dock is telling you what you are
 * about to hit. It is disabled under prefers-reduced-motion, and it is a
 * pure transform so it never reflows the page.
 */

const BASE = 56;      // resting icon box, px
const MAX_SCALE = 1.6;
const RADIUS = 130;   // px of influence either side of the pointer

export type DockItem = {
  id: string;
  label: string;
  /** Small count under the label, e.g. how many things are inside. */
  badge?: string;
  /** True when the item has an open window, drawn as the running dot. */
  running?: boolean;
  glyph: (size: number) => React.ReactNode;
  onOpen: () => void;
};

export default function Dock({ items }: { items: DockItem[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  // State, not a ref. The magnification is DERIVED from these during render, and
  // reading a ref while rendering is exactly the thing that makes a component
  // unsafe to re-run: React has no way to know the output changed. Measuring is
  // rare (pointer enter and resize) so the extra render costs nothing.
  const [centers, setCenters] = useState<number[]>([]);
  const [pointerX, setPointerX] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  // Magnification only makes sense where there is a pointer to magnify toward.
  const [fine, setFine] = useState(true);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => { setReduced(motion.matches); setFine(pointer.matches); };
    sync();
    motion.addEventListener("change", sync);
    pointer.addEventListener("change", sync);
    return () => {
      motion.removeEventListener("change", sync);
      pointer.removeEventListener("change", sync);
    };
  }, []);

  /**
   * Cache resting centres so pointermove does no layout reads.
   *
   * Returns the fresh array as well as storing it. `setCenters` cannot update
   * the `centers` binding the current render closed over, so a caller that
   * measures and then reads `centers` on the next line gets the stale value the
   * measure existed to replace. onFocus below is exactly that caller.
   */
  const measure = useCallback((): number[] => {
    const row = rowRef.current;
    if (!row) return [];
    const next = Array.from(row.children).map((c) => {
      const r = (c as HTMLElement).getBoundingClientRect();
      return r.left + r.width / 2;
    });
    setCenters((prev) =>
      prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next,
    );
    return next;
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [measure, items.length]);

  const nearest = (() => {
    if (pointerX === null) return -1;
    let best = -1, bestD = Infinity;
    centers.forEach((c, i) => {
      const d = Math.abs(pointerX - c);
      if (d < bestD) { bestD = d; best = i; }
    });
    // Only claim a label if the pointer is actually over that item.
    return bestD <= BASE ? best : -1;
  })();

  const scaleFor = (i: number) => {
    if (reduced || !fine || pointerX === null) return 1;
    const c = centers[i];
    if (c === undefined) return 1;
    const d = Math.abs(pointerX - c);
    if (d >= RADIUS) return 1;
    // cosine falloff: 1 at the pointer, easing to 0 at the radius
    const t = (Math.cos((d / RADIUS) * Math.PI) + 1) / 2;
    return 1 + (MAX_SCALE - 1) * t;
  };

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "var(--gy-s-6)",
        transform: "translateX(-50%)",
        zIndex: "var(--gy-z-dock)",
        // Headroom so a fully grown icon and its label are never clipped.
        // Nothing in this band is hoverable: see the row's pointer handlers.
        paddingTop: Math.ceil(BASE * (MAX_SCALE - 1)) + 34,
        // The band is invisible but it still sat over the desktop, swallowing
        // clicks on anything beneath it. The row re-enables them for itself.
        pointerEvents: "none",
      }}
    >
      <div
        ref={rowRef}
        onPointerEnter={measure}
        onPointerMove={(e) => setPointerX(e.clientX)}
        // Leave belongs on the SAME element as move. It used to sit on the
        // wrapper, whose 68px of headroom is above the row: moving the pointer
        // straight up off an icon left it inside the wrapper, so no leave
        // fired, and inside no move handler, so pointerX froze. The icon stayed
        // magnified with its label lit until the pointer happened to cross the
        // wrapper's edge.
        onPointerLeave={() => setPointerX(null)}
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "var(--gy-s-5)",
          padding: `var(--gy-s-3) var(--gy-s-6)`,
          height: BASE + 20,
          minWidth: 120,
          justifyContent: "center",
          background: "var(--gy-chrome)",
          backdropFilter: "var(--gy-blur-heavy)",
          WebkitBackdropFilter: "var(--gy-blur-heavy)",
          border: "1px solid rgba(255, 255, 255, 0.45)",
          borderRadius: "var(--gy-r-dock)",
          boxShadow: "var(--gy-e-dock)",
          pointerEvents: "auto",
        }}
      >
        {items.map((item, i) => {
          const s = scaleFor(i);
          const named = i === nearest;
          return (
            <button
              key={item.id}
              onClick={item.onOpen}
              // No gy-press here: the inline transform below carries the
              // magnification, and an inline transform beats a class, so the
              // :active scale would silently never apply. The dock's feedback
              // is the magnification itself.
              onFocus={() => { const fresh = measure(); setPointerX(fresh[i] ?? null); }}
              onBlur={() => setPointerX(null)}
              aria-label={item.badge ? `${item.label}, ${item.badge}` : item.label}
              style={{
                position: "relative",
                width: BASE,
                height: BASE,
                flex: "0 0 auto",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                padding: 0,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                font: "inherit",
                // NOT scaled. The magnification lives on the glyph wrapper
                // below, so the label and the running dot keep their real size:
                // as a child of a scale(1.6) button the 8px label rendered at
                // nearly 13px and floated 1.6x too far above the strip. Leaving
                // the hit box at a steady 56px is also a better target than one
                // that grows under the pointer.
              }}
            >
              {/* Label rides above the icon, only once it has grown. Its offset
                  has to clear the GROWN glyph, which is why it tracks `s`. */}
              <span
                style={{
                  position: "absolute",
                  bottom: `calc(100% + ${Math.round(8 + BASE * (s - 1))}px)`,
                  left: "50%",
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  padding: "3px 7px",
                  borderRadius: "var(--gy-r-field)",
                  background: "var(--gy-chrome-strong)",
                  backdropFilter: "var(--gy-blur)",
                  WebkitBackdropFilter: "var(--gy-blur)",
                  border: "1px solid rgba(255, 255, 255, 0.5)",
                  fontSize: 8,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--gy-ink-dim)",
                  opacity: named ? 1 : 0,
                  transition: "opacity 120ms var(--gy-ease)",
                  pointerEvents: "none",
                }}
              >
                {item.label}
                {item.badge && (
                  <span style={{ fontFamily: "var(--gy-font-mono)", color: "var(--gy-dead)", marginLeft: 6 }}>
                    {item.badge}
                  </span>
                )}
              </span>

              {/* The magnification. transform-origin bottom pins the icon's
                  base to the strip and grows it upward, the way a real dock
                  behaves. Do not add a translateY here: it would be applied in
                  scaled space, multiply by `s`, and tear the icon off the strip. */}
              <span
                style={{
                  display: "flex",
                  transform: `scale(${s})`,
                  transformOrigin: "bottom center",
                  transition: pointerX === null ? "transform 180ms var(--gy-ease)" : "none",
                  pointerEvents: "none",
                }}
              >
                {item.glyph(BASE)}
              </span>

              {/* running indicator */}
              <span
                style={{
                  position: "absolute",
                  bottom: -7,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 3,
                  height: 3,
                  borderRadius: "var(--gy-r-pill)",
                  background: item.running ? "var(--gy-live)" : "transparent",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
