"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ApiError,
  FailedStartup,
  SearchRequest,
  SearchResponse,
  StartupMatch,
} from "@/lib/types";
import { DESK_DOCS, type DeskDoc } from "@/lib/desktop-content";
import Window from "./Window";
import DesktopIcon from "./DesktopIcon";
import Dock from "./Dock";
import { BinGlyph, MessageGlyph } from "./FolderGlyph";
import Menubar from "./Menubar";
import SpotlightBar from "./SpotlightBar";
import TrashWindow from "./TrashWindow";
import StartupWindow from "./StartupWindow";
import DocWindow from "./DocWindow";
import ForumWindow from "./ForumWindow";
import ResultsWindow, { SIMILARITY_FLOOR, type SearchFlags, type SearchState } from "./ResultsWindow";
import SiteWindow from "./SiteWindow";

/**
 * The desktop: the ground, the folders on it, the dock, and the window
 * manager that opens things.
 *
 * The whole shell is one client component holding one array of open windows.
 * That is deliberate for a 36 hour build: no context, no store, no router
 * state. If it needs to outgrow this, it can.
 */

type Pane =
  | { kind: "doc"; doc: DeskDoc }
  | { kind: "trash" }
  | { kind: "startup"; startup: FailedStartup }
  | { kind: "forum" }
  | { kind: "results" }
  | { kind: "site"; startup: FailedStartup };

type OpenWindow = {
  id: string;
  title: string;
  meta?: string;
  x: number; y: number; width: number; height: number;
  order: number;
  pane: Pane;
  /** Set while zoomed, holding the rect to restore to. */
  restore?: { x: number; y: number; width: number; height: number };
};

/** The search route's cap. Checked here so the user gets a sentence, not a 400. */
const MAX_QUERY_CHARS = 500;

/**
 * An ApiError body, or an honest fallback.
 *
 * `res.json()` on a platform 502 gets an HTML error page and rejects with a
 * SyntaxError, which would then be shown to the user AS the product's error
 * copy. A JSON body with no `error` key is worse: `undefined` reaches the
 * banner and paints an empty red box with nothing in it.
 */
async function errorText(res: Response): Promise<string> {
  const fallback = `The server answered ${res.status}.`;
  try {
    const parsed = JSON.parse(await res.text()) as Partial<ApiError>;
    return typeof parsed.error === "string" && parsed.error ? parsed.error : fallback;
  } catch {
    return fallback;
  }
}

const SIZES: Record<Pane["kind"], { width: number; height: number }> = {
  doc:     { width: 560, height: 420 },
  trash:   { width: 760, height: 540 },
  startup: { width: 620, height: 560 },
  forum:   { width: 700, height: 520 },
  results: { width: 720, height: 620 },
  site:    { width: 900, height: 600 },
};

export default function Desktop({ startups }: { startups: FailedStartup[] }) {
  const [wins, setWins] = useState<OpenWindow[]>([]);
  const [top, setTop] = useState(0);
  const [sel, setSel] = useState<string | null>(null);

  const focus = useCallback((id: string) => {
    setTop((t) => {
      const next = t + 1;
      setWins((ws) => ws.map((w) => (w.id === id ? { ...w, order: next } : w)));
      return next;
    });
  }, []);

  const open = useCallback((id: string, title: string, pane: Pane, meta?: string) => {
    setWins((ws) => {
      if (ws.some((w) => w.id === id)) return ws;           // already open, just raise
      // Clamp to the viewport. SIZES are desktop figures, and a 900px window
      // opened on a 390px screen puts its own close button off the edge with
      // no way back: the ground does not scroll (globals.css sets overflow
      // hidden) and drag is clamped to keep the titlebar reachable, not to
      // bring the body back.
      const width = Math.min(SIZES[pane.kind].width, window.innerWidth - 32);
      const height = Math.min(SIZES[pane.kind].height, window.innerHeight - 140);
      // Cascade so a stack of windows stays legible.
      const step = ws.length % 6;
      const x = Math.max(16, Math.round(window.innerWidth * 0.5 - width / 2) + step * 26 - 60);
      const y = Math.max(24, Math.round(window.innerHeight * 0.5 - height / 2) + step * 22 - 70);
      return [...ws, { id, title, meta, x, y, width, height, order: 0, pane }];
    });
    focus(id);
  }, [focus]);

  const close = useCallback((id: string) => setWins((ws) => ws.filter((w) => w.id !== id)), []);

  /**
   * Retitle the mono field on an OPEN window. Deliberately not `open()`: if the
   * user closes the results window while the search is still running, open()
   * would resurrect it under them. A closed window stays closed.
   */
  const setMeta = useCallback((id: string, meta: string) => {
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, meta } : w)));
  }, []);

  /** Green light: fill the stage, or go back to where the window was. */
  const zoom = useCallback((id: string) => {
    setWins((ws) =>
      ws.map((w) => {
        if (w.id !== id) return w;
        if (w.restore) return { ...w, ...w.restore, restore: undefined };
        const pad = 28;
        const topBar = 26;
        return {
          ...w,
          restore: { x: w.x, y: w.y, width: w.width, height: w.height },
          x: pad,
          y: topBar + pad,
          width: window.innerWidth - pad * 2,
          height: window.innerHeight - topBar - pad * 2 - 96,
        };
      }),
    );
    focus(id);
  }, [focus]);
  const move = useCallback(
    (id: string, x: number, y: number) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, x, y } : w))),
    [],
  );

  const openStartup = useCallback(
    (s: FailedStartup) => open(`startup:${s.id}`, s.name, { kind: "startup", startup: s }, `died ${s.diedYear}`),
    [open],
  );

  const openSite = useCallback(
    (s: FailedStartup) => open(`site:${s.id}`, `${s.name}, archived`, { kind: "site", startup: s }, "web.archive.org"),
    [open],
  );

  /* ---------------------------------------------------------------- *
   * Search. Two calls, not one: /api/search paints the matches fast,
   * /api/report fills the write-up underneath. See docs/search-ux-flow.md.
   * ---------------------------------------------------------------- */

  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  // Newest search wins. Without this, a slow first request can land after a
  // fast second one and overwrite the results the user is actually reading.
  const runId = useRef(0);
  // A request is in flight. A ref, not the state, because two Enter presses in
  // the same tick both read the same stale state and both get through.
  const busy = useRef(false);

  /** Phase 2. Split out so the failure case has something to retry. */
  const runReport = useCallback(
    async (id: number, query: string, matches: StartupMatch[], flags: SearchFlags) => {
      setSearch({ kind: "reporting", query, matches, flags });
      try {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, matches }),
        });
        // The route streams text/plain Markdown, it does not return JSON. On
        // failure it switches to a JSON ApiError, so the two are read
        // differently and the body can only be consumed once.
        if (!res.ok) {
          const message = await errorText(res);
          if (runId.current === id) setSearch({ kind: "report-failed", query, matches, flags, message });
          return;
        }
        const report = await res.text();
        if (runId.current === id) setSearch({ kind: "complete", query, matches, flags, report });
      } catch (err) {
        if (runId.current !== id) return;
        setSearch({
          kind: "report-failed",
          query,
          matches,
          flags,
          message: err instanceof Error ? err.message : "The request did not complete.",
        });
      }
    },
    [],
  );

  const runSearch = useCallback(
    async (query: string) => {
      // Every /api/search is a MiniLM run on the server. Three impatient Enter
      // presses would be three concurrent model loads on a cold instance, so a
      // request already in flight wins (docs/search-ux-flow.md §7).
      if (busy.current) return;

      const id = ++runId.current;
      // The titlebar meta is a short mono field, so it carries the count. The
      // query itself is a whole sentence and belongs in the body, where it is
      // already the first thing on screen. `open` ignores meta on a window that
      // is already open, so set it separately or a second search leaves the
      // previous result's count on the titlebar for the whole request.
      open("results", "Results", { kind: "results" }, "searching");
      setMeta("results", "searching");

      // The route rejects anything longer with a 400, and the bar has no
      // counter, so a pasted two-paragraph idea would come back as a raw
      // validation string with no clue how much to cut.
      if (query.length > MAX_QUERY_CHARS) {
        setMeta("results", "too long");
        setSearch({
          kind: "error",
          query,
          flags: { mock: false, degraded: false },
          message: `That idea is ${query.length} characters. Trim it to ${MAX_QUERY_CHARS} or fewer: a sentence or two describes an idea well enough to match on.`,
        });
        return;
      }

      busy.current = true;
      setSearch({ kind: "searching", query });

      let matches: StartupMatch[];
      let flags: SearchFlags;
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, limit: 5 } satisfies SearchRequest),
        });

        // Read the rails BEFORE the body. They are the only thing standing
        // between a judge and invented companies (app/api/README.md).
        flags = {
          mock: res.headers.get("x-graveyard-mock-data") === "true",
          degraded: res.headers.get("x-graveyard-degraded") === "true",
        };
        if (!res.ok) throw new Error(await errorText(res));

        const data = (await res.json()) as SearchResponse;
        // The floor is a cosine threshold. In degraded mode these are BM25
        // ranks on a different scale entirely, so applying it there would pass
        // junk through at 1.00 and cut real neighbours. Take the route's five.
        matches = flags.degraded
          ? data.matches
          : data.matches.filter((m) => m.similarity >= SIMILARITY_FLOOR);
      } catch (err) {
        if (runId.current === id) {
          setMeta("results", "failed");
          setSearch({
            kind: "error",
            query,
            flags: { mock: false, degraded: false },
            message: err instanceof Error ? err.message : "The search did not complete.",
          });
        }
        return;
      } finally {
        // Only reachable by the run that set it: nothing else can start while
        // it is true.
        busy.current = false;
      }

      if (runId.current !== id) return;
      if (matches.length === 0) {
        setMeta("results", "no matches");
        setSearch({ kind: "empty", query, flags });
        return;
      }
      setMeta("results", `${matches.length} ${matches.length === 1 ? "match" : "matches"}`);
      await runReport(id, query, matches, flags);
    },
    [open, runReport, setMeta],
  );

  const retryReport = useCallback(() => {
    if (search.kind !== "report-failed") return;
    void runReport(++runId.current, search.query, search.matches, search.flags);
  }, [search, runReport]);

  const trashOpen = wins.some((w) => w.id === "trash");
  const forumOpen = wins.some((w) => w.id === "forum");
  const topOrder = Math.max(0, ...wins.map((w) => w.order));

  return (
    <main
      onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--gy-z-desktop)",
        /* A shallow vertical falloff, not a gradient feature. Overcast light
           on wet stone, plus a faint vignette so the edges sink. */
        background: "var(--gy-wall)",
      }}
    >
      <Menubar
        focused={wins.find((w) => w.order === topOrder)?.title ?? null}
        count={startups.length}
      />

      {/* Desktop folders: Archived's own documents. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: "var(--gy-z-icon)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Sit slightly above true centre so the dock does not crowd them.
          paddingBottom: 64,
          paddingTop: "var(--gy-menubar-h)",
          // The wrapper spans the whole ground, so it must not swallow the
          // click that clears the selection.
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 44,
          }}
        >
          {/* A masthead, so somebody landing here knows what this is before
              they open anything. It also gives the centre of the screen
              something to hold. */}
          <header style={{ textAlign: "center", maxWidth: 520 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--gy-font-display)",
                fontWeight: 400,
                fontSize: 62,
                lineHeight: 1,
                letterSpacing: "-0.015em",
                color: "#ffffff",
                textShadow: "0 2px 10px rgba(0, 24, 48, 0.45)",
              }}
            >
              Archived
            </h1>
            <p
              style={{
                margin: "var(--gy-s-5) 0 0",
                fontSize: "var(--gy-t-lead)",
                lineHeight: 1.5,
                color: "rgba(255, 255, 255, 0.92)",
                textShadow: "0 1px 6px rgba(0, 24, 48, 0.45)",
              }}
            >
              Every idea has been tried before. Open the trash to meet the
              companies that tried yours, and find out what actually killed them.
            </p>
          </header>

          {/* The product's entry point, wired to POST /api/search. */}
          <SpotlightBar onSubmit={runSearch} />

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "var(--gy-s-8)",
              maxWidth: 820,
            }}
          >
        {DESK_DOCS.map((doc) => (
          <DesktopIcon
            key={doc.id}
            label={doc.label}
            sub={doc.sub}
            onWallpaper
            icon={doc.icon}
            size={104}
            selected={sel === doc.id}
            onSelect={() => setSel(doc.id)}
            onOpen={() => open(`doc:${doc.id}`, doc.title, { kind: "doc", doc })}
          />
        ))}
          </div>
        </div>
      </div>

      {/* Windows */}
      {wins.map((w) => (
        <Window
          key={w.id}
          id={w.id}
          title={w.title}
          meta={w.meta}
          x={w.x} y={w.y} width={w.width} height={w.height}
          order={w.order}
          active={w.order === topOrder}
          zoomed={Boolean(w.restore)}
          onFocus={focus}
          onClose={close}
          onZoom={zoom}
          onMove={move}
        >
          {w.pane.kind === "doc" && <DocWindow doc={w.pane.doc} />}
          {w.pane.kind === "startup" && <StartupWindow s={w.pane.startup} />}
          {/* startups: so a resolved @mention can show the real company name
              (forum-reads.md "Rendering @mentions") — already loaded here,
              just not previously threaded down to Sam's canvas.
              onOpenStartup: reuses the same opener ResultsWindow/TrashWindow
              already use, so clicking a mention opens the same StartupWindow. */}
          {w.pane.kind === "forum" && <ForumWindow startups={startups} onOpenStartup={openStartup} />}
          {w.pane.kind === "site" && <SiteWindow s={w.pane.startup} />}
          {w.pane.kind === "results" && (
            <ResultsWindow
              state={search}
              onOpenStartup={openStartup}
              onOpenSite={openSite}
              onRetryReport={retryReport}
            />
          )}
          {w.pane.kind === "trash" && (
            <TrashWindow startups={startups} onOpenStartup={openStartup} />
          )}
        </Window>
      ))}

      <Dock
        items={[
          {
            id: "forum",
            label: "forum",
            running: forumOpen,
            glyph: (size) => <MessageGlyph size={size} />,
            onOpen: () => open("forum", "Forum", { kind: "forum" }),
          },
          {
            id: "trash",
            label: "trash",
            badge: String(startups.length),
            running: trashOpen,
            glyph: (size) => <BinGlyph full size={size} />,
            onOpen: () =>
              open("trash", "Trash", { kind: "trash" }, `${startups.length} companies`),
          },
        ]}
      />
    </main>
  );
}
