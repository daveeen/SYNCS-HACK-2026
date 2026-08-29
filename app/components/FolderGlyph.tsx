"use client";

/**
 * The desktop icon set.
 *
 * A real desktop is not eight identical folders: it is documents, apps and a
 * bin, and you navigate it by shape before you ever read a label. So each
 * desktop item gets its own glyph, while the dead companies in the trash all
 * stay folders, because there the sameness is the point.
 */

type Tone = "live" | "dead";

/**
 * Size the glyph through CSS rather than the SVG width and height attributes,
 * so `size` can be a responsive length: the desktop icons pass a `clamp()` that
 * tracks both viewport axes, and an attribute cannot take one.
 *
 * `height: auto` leaves the aspect ratio to the viewBox, which is also why the
 * folder no longer needs its own `size * 0.8`: 60 by 48 is already in the box.
 */
const GLYPH = (size: number | string): React.CSSProperties => ({
  width: size,
  height: "auto",
  display: "block",
});

const PAL: Record<Tone, { tab: string; faceTop: string; faceBot: string; edge: string }> = {
  live: { tab: "#7cc2f0", faceTop: "#6fbdee", faceBot: "#3f97d8", edge: "#2f83c2" },
  dead: { tab: "#c3b6a5", faceTop: "#bcae9c", faceBot: "#9c8d7b", edge: "#87796a" },
};

/* ---------- folder (trash contents) ---------- */

export function FolderGlyph({ tone = "live", size = 54 }: { tone?: Tone; size?: number | string }) {
  const c = PAL[tone];
  const id = `fg-${tone}`;
  return (
    <svg viewBox="0 0 60 48" aria-hidden="true" style={GLYPH(size)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.faceTop} />
          <stop offset="1" stopColor={c.faceBot} />
        </linearGradient>
      </defs>
      <path
        d="M2 8 h18 l5 6 h33 a2 2 0 0 1 2 2 v28 a2 2 0 0 1 -2 2 H2 a2 2 0 0 1 -2 -2 V10 a2 2 0 0 1 2 -2 z"
        fill={c.tab} stroke={c.edge} strokeWidth="0.75"
      />
      <path
        d="M0 16 h60 v28 a2 2 0 0 1 -2 2 H2 a2 2 0 0 1 -2 -2 z"
        fill={`url(#${id})`} stroke={c.edge} strokeWidth="0.75"
      />
      <path d="M0.5 16.5 h59" stroke="rgba(255,255,255,0.5)" strokeWidth="1" fill="none" />
    </svg>
  );
}

/* ---------- shared page shape for document icons ---------- */

function Page({ children, accent }: { children?: React.ReactNode; accent: string }) {
  return (
    <>
      <path
        d="M13 3 h23 l13 13 v42 a3 3 0 0 1 -3 3 H13 a3 3 0 0 1 -3 -3 V6 a3 3 0 0 1 3 -3 z"
        fill="#fdfdfb" stroke="#b9bec4" strokeWidth="1.1" strokeLinejoin="round"
      />
      {/* folded corner */}
      <path d="M36 3 v10 a3 3 0 0 0 3 3 h10 z" fill="#e4e8ec" stroke="#b9bec4" strokeWidth="1.1" strokeLinejoin="round" />
      {/* accent stripe along the head of the page */}
      <path d="M10 22 h39" stroke={accent} strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
      {children}
    </>
  );
}

/** read_me: a plain text document. */
export function DocGlyph({ size = 54 }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" style={GLYPH(size)}>
      <Page accent="#4a90d9">
        {[30, 37, 44, 51].map((y, i) => (
          <path
            key={y}
            d={`M17 ${y} h${i === 3 ? 16 : 29}`}
            stroke="#aeb5bd" strokeWidth="2" strokeLinecap="round"
          />
        ))}
      </Page>
    </svg>
  );
}

/** method: a schematic. Same page, but it holds a flow instead of prose. */
export function FlowGlyph({ size = 54 }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" style={GLYPH(size)}>
      <Page accent="#3fa38a">
        <path d="M22 33 h9 M35 33 h9 M22 33 v13 h22 v-13" stroke="#9aa3ab" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="19" cy="33" r="3.4" fill="#3fa38a" />
        <circle cx="33" cy="33" r="3.4" fill="#7fb8d4" />
        <circle cx="47" cy="33" r="3.4" fill="#3fa38a" />
        <circle cx="33" cy="49" r="3.4" fill="#c9713f" />
      </Page>
    </svg>
  );
}

/* ---------- app-tile icons ---------- */

function Tile({ from, to, id, children }: { from: string; to: string; id: string; children: React.ReactNode }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="54" height="54" rx="13" fill={`url(#${id})`} />
      <rect x="5.6" y="5.6" width="52.8" height="52.8" rx="12.6" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.1" />
      {children}
    </>
  );
}

/** causes: the symptom-versus-disease reading, as a vital sign that flatlines. */
export function VitalsGlyph({ size = 54 }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" style={GLYPH(size)}>
      <Tile id="tile-vitals" from="#e8785a" to="#b2402a">
        <path
          d="M13 34 h9 l4 -11 l6 22 l5 -13 h4"
          stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"
        />
        {/* the line gives out */}
        <path d="M41 34 h10" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
      </Tile>
    </svg>
  );
}

/** team: the people who built it. */
export function UsersGlyph({ size = 54 }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" style={GLYPH(size)}>
      <Tile id="tile-users" from="#7fb2e0" to="#3d6f9e">
        {/* back figure */}
        <circle cx="41" cy="26" r="7" fill="rgba(255,255,255,0.55)" />
        <path d="M28 48 a13 13 0 0 1 26 0 z" fill="rgba(255,255,255,0.55)" />
        {/* front figure */}
        <circle cx="25" cy="24" r="8.5" fill="#fff" />
        <path d="M10 49 a15 15 0 0 1 30 0 z" fill="#fff" />
      </Tile>
    </svg>
  );
}

/** forum: a speech bubble, for the dock. */
export function MessageGlyph({ size = 44 }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" style={GLYPH(size)}>
      <defs>
        <linearGradient id="tile-forum" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd08a" />
          <stop offset="1" stopColor="#3d9b5a" />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="54" height="54" rx="13" fill="url(#tile-forum)" />
      <rect x="5.6" y="5.6" width="52.8" height="52.8" rx="12.6" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.1" />
      <path
        d="M17 20 h30 a4 4 0 0 1 4 4 v15 a4 4 0 0 1 -4 4 H30 l-9 7 v-7 h-4 a4 4 0 0 1 -4 -4 V24 a4 4 0 0 1 4 -4 z"
        fill="#fff"
      />
      <path d="M22 28 h20 M22 35 h13" stroke="#3d9b5a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- trash ---------- */

export function BinGlyph({ full = false, size = 44 }: { full?: boolean; size?: number | string }) {
  const metal = "#8e949a";
  const dark = "#6d747a";
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true" style={GLYPH(size)}>
      <defs>
        <linearGradient id="bin-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9cdd1" />
          <stop offset="0.5" stopColor="#eceef0" />
          <stop offset="1" stopColor="#b8bdc2" />
        </linearGradient>
      </defs>
      <path d="M10.5 12.5 h23" stroke={dark} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M18 12.5 v-2.2 a1.6 1.6 0 0 1 1.6 -1.6 h4.8 a1.6 1.6 0 0 1 1.6 1.6 V12.5"
        stroke={dark} strokeWidth="1.8" fill="none" strokeLinejoin="round"
      />
      <path
        d="M13 14.5 L14.6 34.4 a2.2 2.2 0 0 0 2.2 2 h10.4 a2.2 2.2 0 0 0 2.2 -2 L31 14.5 z"
        fill="url(#bin-body)" stroke={metal} strokeWidth="1"
      />
      <path
        d="M18.6 19 l0.7 13 M22 19 v13 M25.4 19 l-0.7 13"
        stroke={metal} strokeWidth="1" strokeLinecap="round" opacity="0.8" fill="none"
      />
      {full && <path d="M14.4 21 h15.2" stroke="#9a4f2b" strokeWidth="1.4" opacity="0.5" />}
    </svg>
  );
}

/** Registry so content can name its icon by string. */
export const ICONS = {
  doc: DocGlyph,
  flow: FlowGlyph,
  vitals: VitalsGlyph,
  users: UsersGlyph,
} as const;

export type IconName = keyof typeof ICONS;
