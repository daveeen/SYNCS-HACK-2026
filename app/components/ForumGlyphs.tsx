"use client";

/**
 * Hand-drawn glyphs for the forum: account, like, comment, back. Same
 * convention as FolderGlyph.tsx — no icon library, no emoji — but these are
 * thin outline strokes meant to sit inline in UI, not tile artwork on the
 * desktop, so they live in their own file rather than crowding that registry.
 */

type IconProps = { size?: number; className?: string };

/** Signed-out account button: a plain head-and-shoulders outline. */
export function PersonGlyph({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="4.25" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3.75 20.5c1.1-4.2 4.5-6.5 8.25-6.5s7.15 2.3 8.25 6.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Like. Outline by default, fills solid when active — no colour change on
    hover, so the only thing that reads as "liked" is the fill, not motion. */
export function HeartGlyph({ size = 14, active = false }: IconProps & { active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.2c-.25 0-.5-.08-.7-.24C6.9 16.4 3.5 13.3 3.5 9.6 3.5 6.9 5.6 4.8 8.3 4.8c1.6 0 3 .76 3.7 1.95.7-1.2 2.1-1.95 3.7-1.95 2.7 0 4.8 2.1 4.8 4.8 0 3.7-3.4 6.8-7.8 10.36-.2.16-.45.24-.7.24z"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Comment count. A small speech bubble, outline only — the filled version
    is MessageGlyph's job as a dock tile, this one has to sit at 12-14px. */
export function BubbleGlyph({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H9.8l-4.3 3.3v-3.3H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Back chevron, for leaving a post and returning to the feed. */
export function BackGlyph({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5.5 8 12l7 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
