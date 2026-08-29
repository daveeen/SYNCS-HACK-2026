"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One draggable window. Owns its own chrome and internal scroll; the desktop
 * ground never scrolls (see html/body overflow in globals.css).
 *
 * Ownership note: app/components/ is Sam's per CLAUDE.md. This is a first
 * draft of the shell mechanics, not a finished visual pass.
 */

export type WindowProps = {
  id: string;
  title: string;
  /** Monospace line on the right of the titlebar. Optional. */
  meta?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Stacking order within the window layer. */
  order: number;
  active: boolean;
  /**
   * True while the exit animation plays. Owned by Desktop, not here: the
   * desktop is the thing that has to know a closing window is still in its
   * list, so that re-opening it during those 120ms revives it rather than
   * being swallowed as "already open" and then removed by the pending timer.
   */
  closing?: boolean;
  /** True when the window is filling the stage. */
  zoomed?: boolean;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onZoom: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  children: React.ReactNode;
};

/** How long the exit animation runs. Desktop waits this long before unmounting. */
export const WINDOW_CLOSE_MS = 120;

export default function Window({
  id, title, meta, x, y, width, height, order,
  active, zoomed = false, closing = false, onFocus, onClose, onZoom, onMove, children,
}: WindowProps) {
  const [dragging, setDragging] = useState(false);
  // Amber rolls the window up to its titlebar. Local, because it is pure
  // chrome: the desktop does not need to know.
  const [collapsed, setCollapsed] = useState(false);
  const [lightsHot, setLightsHot] = useState(false);
  const grab = useRef({ dx: 0, dy: 0 });

  const requestClose = useCallback(() => onClose(id), [id, onClose]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only the titlebar drags, and only with the primary button.
      if (e.button !== 0) return;
      onFocus(id);
      grab.current = { dx: e.clientX - x, dy: e.clientY - y };
      setDragging(true);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [id, x, y, onFocus],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      // Keep the titlebar reachable: clamp so a window can never be dragged
      // fully off the top or past the dock.
      const nx = Math.min(Math.max(e.clientX - grab.current.dx, -width + 120), window.innerWidth - 120);
      const ny = Math.min(Math.max(e.clientY - grab.current.dy, 0), window.innerHeight - 96);
      onMove(id, nx, ny);
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, id, onMove, width]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, requestClose]);

  return (
    <section
      role="dialog"
      aria-label={title}
      onPointerDown={() => onFocus(id)}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height: collapsed ? 32 : height,
        zIndex: `calc(var(--gy-z-window) + ${order})`,
        background: "var(--gy-surface)",
        // Just enough blur to pick up colour from the wallpaper at the
        // edges. Any more and text sits on top of moving shapes.
        backdropFilter: "saturate(150%) blur(20px)",
        WebkitBackdropFilter: "saturate(150%) blur(20px)",
        border: "1px solid var(--gy-line)",
        borderRadius: "var(--gy-r-window)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: closing
          ? `gy-window-out ${WINDOW_CLOSE_MS}ms var(--gy-ease) both`
          : "gy-window-in 160ms var(--gy-ease) both",
        // A window on its way out must not eat the click that opens the next.
        pointerEvents: closing ? "none" : undefined,
        // Inactive windows stay fully opaque. Dimming them with opacity lets
        // the desktop show through the content, which reads as a rendering
        // bug on a light ground. Recession is carried by the greyed traffic
        // lights, the dimmed title and a shallower shadow instead.
        boxShadow: active ? "var(--gy-e-window)" : "0 8px 24px rgba(20,28,36,0.18), 0 0 0 0.5px rgba(0,0,0,0.14)",
        transition: dragging ? "none" : "box-shadow var(--gy-dur) var(--gy-ease)",
      }}
    >
      <header
        onPointerDown={onPointerDown}
        onDoubleClick={() => { setCollapsed(false); onZoom(id); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--gy-s-4)",
          padding: "0 var(--gy-s-5)",
          height: 32,
          flex: "0 0 auto",
          background: "var(--gy-chrome-strong)",
          backdropFilter: "var(--gy-blur)",
          WebkitBackdropFilter: "var(--gy-blur)",
          borderBottom: "1px solid var(--gy-line-soft)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.55)",
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
          // Without this a touch drag on the titlebar is claimed by the browser
          // as a scroll gesture and the window never moves.
          touchAction: "none",
        }}
      >
        <div
          onMouseEnter={() => setLightsHot(true)}
          onMouseLeave={() => setLightsHot(false)}
          style={{ display: "flex", gap: 8, flex: "0 0 auto", marginRight: "var(--gy-s-1)" }}
        >
          {([
            { key: "close", color: "var(--gy-tl-close)", label: `Close ${title}`, mark: "\u00d7",
              run: requestClose },
            { key: "min", color: "var(--gy-tl-min)", label: `${collapsed ? "Expand" : "Collapse"} ${title}`, mark: "\u2212",
              run: () => setCollapsed((v) => !v) },
            { key: "zoom", color: "var(--gy-tl-zoom)", label: `${zoomed ? "Restore" : "Zoom"} ${title}`, mark: "+",
              run: () => { setCollapsed(false); onZoom(id); } },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={(e) => { e.stopPropagation(); t.run(); }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t.label}
              style={{
                width: 12, height: 12, padding: 0, lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "var(--gy-r-pill)",
                border: "none",
                // macOS greys the lights out until the window is focused.
                background: active ? t.color : "#d2d2cf",
                boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.16)",
                cursor: "pointer",
                fontSize: 9,
                fontWeight: 700,
                color: "rgba(0,0,0,0.55)",
                opacity: lightsHot && active ? 1 : 0.999,
              }}
            >
              <span style={{ opacity: lightsHot ? 1 : 0, transition: "opacity 90ms var(--gy-ease)" }}>
                {t.mark}
              </span>
            </button>
          ))}
        </div>
        <span
          style={{
            fontSize: "var(--gy-t-ui)",
            fontWeight: 500,
            color: active ? "var(--gy-ink)" : "var(--gy-ink-dim)",
            letterSpacing: "0.01em",
          }}
        >
          {title}
        </span>
        {meta && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--gy-font-mono)",
              fontSize: "var(--gy-t-micro)",
              color: "var(--gy-ink-faint)",
            }}
          >
            {meta}
          </span>
        )}
      </header>

      {!collapsed && (
        <div
          style={{
            flex: "1 1 auto",
            overflow: "auto",
            // 16px a side is 8% of a 390px window. The content needs that width
            // more than the chrome does.
            padding: "clamp(var(--gy-s-5), 3vw, var(--gy-s-7))",
            // A window body scrolls; the ground behind it must not scroll with
            // it when the body hits its end.
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}
