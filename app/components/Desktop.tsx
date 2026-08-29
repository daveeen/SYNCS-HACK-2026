"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiError,
  FailedStartup,
  SearchRequest,
  SearchResponse,
  StartupMatch,
} from "@/lib/types";
import { DESK_DOCS, type DeskDoc } from "@/lib/desktop-content";
import Window, { WINDOW_CLOSE_MS } from "./Window";
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
  /** Set while the exit animation plays, just before the row is dropped. */
  closing?: boolean;
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

/** Preferred size on a roomy screen. Never used raw: see `fit()`. */
const SIZES: Record<Pane["kind"], { width: number; height: number }> = {
  doc:     { width: 560, height: 420 },
  trash:   { width: 760, height: 540 },
  startup: { width: 620, height: 560 },
  forum:   { width: 700, height: 520 },
  results: { width: 720, height: 620 },
  site:    { width: 900, height: 600 },
};

/** Below this the desktop metaphor stops working and windows go full-bleed. */
const COMPACT_W = 760;

/** Chrome that a window must never be allowed to sit under. */
const MENUBAR = 26;
const DOCK_RESERVE = 92;
const GUTTER = 16;

/**
 * The largest a window of this kind may be on THIS viewport, and where it sits.
 *
 * Every size in SIZES is a desktop figure. A 900px window on a 390px screen put
 * its own close button past the edge with no way back, because the ground does
 * not scroll and the drag clamp keeps the titlebar reachable rather than
 * bringing the body back. Height matters just as much: a 620px window on a
 * 500px-tall laptop in landscape ran under the dock.
 *
 * On a compact screen the cascade is dropped too. Offsetting windows so a stack
 * stays legible is a large-screen idea; at 390px it only pushes each new window
 * further off the edge.
 */
function fit(kind: Pane["kind"], index: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const compact = vw < COMPACT_W;

  // No minimum floor. A floor above the available space produces a rect that
  // fails the resize handler's own overflow test, so every resize event re-fits
  // and re-fits: on mobile Safari, which fires resize continuously while the
  // URL bar collapses, that snapped any window the user had dragged back to
  // centre on every tick. Below about 300px of height the window is unusable
  // either way; being honest about the space is better than lying about it.
  const maxW = Math.max(160, vw - GUTTER * 2);
  const maxH = Math.max(140, vh - MENUBAR - DOCK_RESERVE - GUTTER);

  const width = Math.min(SIZES[kind].width, maxW);
  const height = Math.min(SIZES[kind].height, maxH);

  if (compact) {
    return { width, height, x: Math.round((vw - width) / 2), y: MENUBAR + GUTTER };
  }

  const step = index % 6;
  return {
    width,
    height,
    x: Math.max(GUTTER, Math.round(vw * 0.5 - width / 2) + step * 26 - 60),
    y: Math.max(MENUBAR + 8, Math.round(vh * 0.5 - height / 2) + step * 22 - 70),
  };
}

export default function Desktop({ startups }: { startups: FailedStartup[] }) {
  const [wins, setWins] = useState<OpenWindow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  // A monotonic counter, in a ref rather than state. Its value is never
  // rendered: it is stamped onto the window it raises, and `topOrder` below is
  // derived from the windows themselves. As state it forced an extra render per
  // focus, and its updater dispatched setWins as a side effect, which React is
  // free to run twice.
  const order = useRef(0);
  /** Pending window removals, so a re-open can cancel one. */
  const closeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const focus = useCallback((id: string) => {
    const next = (order.current += 1);
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, order: next } : w)));
  }, []);

  const open = useCallback((id: string, title: string, pane: Pane, meta?: string) => {
    // Cancel a pending removal: this id is being re-opened mid-exit.
    const pending = closeTimers.current.get(id);
    if (pending !== undefined) {
      clearTimeout(pending);
      closeTimers.current.delete(id);
    }

    setWins((ws) => {
      const existing = ws.find((w) => w.id === id);
      // Already open and staying open: just raise it.
      if (existing && !existing.closing) return ws;
      // Already open but on its way out. Without this branch, closing the trash
      // and immediately re-opening it hit the "already open" path, did nothing,
      // and then the pending timer removed the window anyway: the click was
      // eaten and the user had to click a third time.
      if (existing) return ws.map((w) => (w.id === id ? { ...w, closing: false } : w));
      return [...ws, { id, title, meta, ...fit(pane.kind, ws.length), order: 0, pane }];
    });
    focus(id);
  }, [focus]);

  /**
   * Re-fit open windows when the viewport changes.
   *
   * Sizing only at open time is not responsive, it is responsive-once. Rotate a
   * phone, drag the browser narrow, or open the devtools panel and every window
   * already on screen keeps its old rect, with the close button somewhere past
   * the edge. Only windows that no longer fit are touched, so a window the user
   * has deliberately moved is left where they put it.
   */
  useEffect(() => {
    let frame = 0;

    const refit = () => {
      frame = 0;
      setWins((ws) => {
        let changed = false;
        const next = ws.map((w, i) => {
          // The single test: has the window escaped the viewport? Comparing
          // against a separately computed maximum let the two disagree, and a
          // rect that can never satisfy the test re-fits forever.
          const escapesX = w.x < 0 || w.x + w.width > window.innerWidth;
          const escapesY =
            w.y < MENUBAR || w.y + w.height > window.innerHeight - DOCK_RESERVE / 2;
          if (!escapesX && !escapesY) return w;
          changed = true;
          // A zoomed window re-fits to the new stage; its restore rect is stale
          // now, so drop it rather than restore to a rect off the new screen.
          return { ...w, ...fit(w.pane.kind, i), restore: undefined };
        });
        // Same array reference when nothing moved. `ws.map` always allocates,
        // and returning a new array from setWins re-renders every open window
        // on every one of the hundreds of events a window drag emits.
        return changed ? next : ws;
      });
    };

    // Coalesce to one re-fit per frame.
    const onResize = () => {
      if (frame === 0) frame = requestAnimationFrame(refit);
    };
    // iOS fires orientationchange BEFORE innerWidth and innerHeight update, so
    // reading them in the same tick returns the pre-rotation size.
    const onOrientation = () => setTimeout(onResize, 120);

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, []);

  /**
   * Mark the window closing, let the exit animation play, then drop it.
   *
   * The row stays in `wins` for those 120ms, which is why `open()` above has to
   * know about `closing`. The timer is tracked so a re-open can cancel it.
   */
  const close = useCallback((id: string) => {
    if (closeTimers.current.has(id)) return;             // already on its way out
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, closing: true } : w)));
    const timer = setTimeout(() => {
      closeTimers.current.delete(id);
      setWins((ws) => ws.filter((w) => w.id !== id));
    }, WINDOW_CLOSE_MS);
    closeTimers.current.set(id, timer);
  }, []);

  // Nothing should still be scheduled after the desktop goes away.
  useEffect(() => {
    const timers = closeTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

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
        // Fill the stage, which is the viewport minus the menubar and the dock.
        // Padding shrinks on a small screen: 28px a side is 14% of a 390px
        // phone, and the window needs that width more than the wallpaper does.
        const pad = window.innerWidth < COMPACT_W ? 10 : 28;
        return {
          ...w,
          restore: { x: w.x, y: w.y, width: w.width, height: w.height },
          x: pad,
          y: MENUBAR + pad,
          width: window.innerWidth - pad * 2,
          height: window.innerHeight - MENUBAR - pad * 2 - DOCK_RESERVE,
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
        const header = res.headers.get("x-graveyard-report-source");
        const source =
          header === "claude" || header === "cache" ? header : "composed";
        const report = await res.text();
        if (runId.current === id) setSearch({ kind: "complete", query, matches, flags, report, source });
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
          // Reserve the dock strip, and the menubar above.
          paddingBottom: DOCK_RESERVE,
          paddingTop: "var(--gy-menubar-h)",
          paddingLeft: "var(--gy-s-6)",
          paddingRight: "var(--gy-s-6)",
          // On a short viewport the masthead, bar and icons together are taller
          // than the ground. The ground itself must never scroll (globals.css),
          // so this column does, and the dock stays put.
          overflowY: "auto",
          overflowX: "hidden",
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
            // Collapses on a short screen before anything is allowed to clip.
            gap: "clamp(var(--gy-s-7), 4vh, 44px)",
            paddingTop: "clamp(var(--gy-s-7), 3vh, 32px)",
            paddingBottom: "clamp(var(--gy-s-7), 3vh, 32px)",
            margin: "auto",
            width: "100%",
            maxWidth: 860,
          }}
        >
          {/* A masthead, so somebody landing here knows what this is before
              they open anything. It also gives the centre of the screen
              something to hold. */}
          <header style={{ textAlign: "center", maxWidth: 520, width: "100%" }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--gy-font-display)",
                fontWeight: 400,
                // Tracks BOTH axes. vw alone still overflows a 900x420 laptop
                // in landscape, where the constraint is height, not width.
                fontSize: "clamp(34px, min(11vw, 8vh), 62px)",
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
                margin: "var(--gy-s-5) auto 0",
                maxWidth: "46ch",
                fontSize: "clamp(var(--gy-t-body), 3.4vw, var(--gy-t-lead))",
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

          {/* A grid, not flex-wrap: four 104px icons wrapped 3 + 1 at 390px and
              left a widow on its own row. See globals.css › .gy-desk-grid for
              why the column count is explicit rather than auto-fit. */}
          <div className="gy-desk-grid" style={{ maxWidth: 820 }}>
            {DESK_DOCS.map((doc) => (
              <DesktopIcon
                key={doc.id}
                label={doc.label}
                sub={doc.sub}
                onWallpaper
                icon={doc.icon}
                // Shrinks with the viewport on both axes, same reason as the
                // masthead: a short landscape screen has no room for 104px.
                size="clamp(56px, min(14vw, 12vh), 104px)"
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
          closing={w.closing}
          onFocus={focus}
          onClose={close}
          onZoom={zoom}
          onMove={move}
        >
          {w.pane.kind === "doc" && <DocWindow doc={w.pane.doc} />}
          {w.pane.kind === "startup" && <StartupWindow s={w.pane.startup} />}
          {w.pane.kind === "forum" && <ForumWindow />}
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
