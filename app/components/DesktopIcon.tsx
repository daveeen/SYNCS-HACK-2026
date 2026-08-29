"use client";

import { FolderGlyph, ICONS, type IconName } from "./FolderGlyph";

/**
 * A folder sitting on the desktop (or inside the trash window).
 *
 * Opens on double click, like a real desktop, but also on Enter/Space so the
 * shell is reachable without a mouse. Single click selects.
 */
export type DesktopIconProps = {
  label: string;
  sub?: string;
  tone?: "live" | "dead";
  selected?: boolean;
  /** True when the icon sits on the wallpaper rather than inside a window.
      Desktop labels need a halo to stay legible over an arbitrary ground,
      the same trick the real OS uses. */
  onWallpaper?: boolean;
  /**
   * Glyph width. Desktop folders run large; trash contents stay compact.
   * Accepts a CSS length so the caller can pass a responsive `clamp()`.
   */
  size?: number | string;
  /** Draw a specific icon instead of the default folder. */
  icon?: IconName;
  onOpen: () => void;
  onSelect?: () => void;
};

export default function DesktopIcon({
  label, sub, tone = "live", selected = false, onWallpaper = false, size = 54,
  icon, onOpen, onSelect,
}: DesktopIconProps) {
  const Glyph = icon ? ICONS[icon] : null;
  // White text with a dark shadow is how an OS keeps desktop labels legible
  // over an arbitrary wallpaper.
  const halo = onWallpaper ? "0 1px 3px rgba(0, 20, 40, 0.55)" : undefined;
  const labelColor = onWallpaper ? "#ffffff" : "var(--gy-ink)";
  const subColor = onWallpaper ? "rgba(255, 255, 255, 0.82)" : "var(--gy-ink-dim)";
  // The label sits under a glyph of `size`, so the hit box has to track it.
  // calc() rather than arithmetic, because size can be a responsive clamp().
  const boxWidth = typeof size === "number" ? Math.round(size * 1.55) : `calc(${size} * 1.55)`;

  return (
    <button
      // gy-press gives the press feedback; gy-icon the hover, gated behind a
      // fine pointer so a tap does not leave the icon stuck lit. Neither can be
      // expressed inline, which is why nothing in this shell reacted to a press
      // before. See globals.css › Interaction states.
      className={`gy-press ${onWallpaper ? "gy-icon" : "gy-icon-sunk"}`}
      onClick={() => {
        // Double click to open is a mouse convention that a touch screen does
        // not have: on a phone the second tap lands as a new tap, and the
        // folder never opens. One tap opens there, click-to-select stays on a
        // pointer that can hover.
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
          onOpen();
          return;
        }
        onSelect?.();
      }}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
      aria-label={sub ? `${label}, ${sub}` : label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--gy-s-2)",
        width: boxWidth,
        maxWidth: "100%",
        padding: "var(--gy-s-3) var(--gy-s-2) var(--gy-s-4)",
        background: selected ? "rgba(109,143,125,0.12)" : "transparent",
        border: `1px solid ${selected ? "var(--gy-live-dim)" : "transparent"}`,
        borderRadius: "var(--gy-r-icon)",
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
        textAlign: "center",
        // A desktop icon opens on double click, but a touch screen has no such
        // thing. Without this the browser waits 300ms and then zooms the page
        // instead of opening the folder.
        touchAction: "manipulation",
      }}
    >
      <span style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }}>
        {Glyph ? <Glyph size={size} /> : <FolderGlyph tone={tone} size={size} />}
      </span>
      <span
        style={{
          fontSize: "var(--gy-t-meta)",
          fontWeight: 500,
          color: labelColor,
          textShadow: halo,
          lineHeight: 1.25,
          wordBreak: "break-word",
        }}
      >
        {label}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: "var(--gy-font-mono)",
            fontSize: "var(--gy-t-micro)",
            color: subColor,
            textShadow: halo,
            lineHeight: 1.2,
          }}
        >
          {sub}
        </span>
      )}
    </button>
  );
}
