"use client";

import { useCallback, useState } from "react";
import type { FailedStartup } from "@/lib/types";
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
  | { kind: "forum" };

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

const SIZES: Record<Pane["kind"], { width: number; height: number }> = {
  doc:     { width: 560, height: 420 },
  trash:   { width: 760, height: 540 },
  startup: { width: 620, height: 560 },
  forum:   { width: 700, height: 520 },
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
      const { width, height } = SIZES[pane.kind];
      // Cascade so a stack of windows stays legible.
      const step = ws.length % 6;
      const x = Math.max(24, Math.round(window.innerWidth * 0.5 - width / 2) + step * 26 - 60);
      const y = Math.max(24, Math.round(window.innerHeight * 0.5 - height / 2) + step * 22 - 70);
      return [...ws, { id, title, meta, x, y, width, height, order: 0, pane }];
    });
    focus(id);
  }, [focus]);

  const close = useCallback((id: string) => setWins((ws) => ws.filter((w) => w.id !== id)), []);

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

          {/* The product's entry point. Presentation only until Yeriel's
              /api/search is ready; see SpotlightBar.tsx for the one handler
              that needs filling in. */}
          <SpotlightBar />

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
          {w.pane.kind === "forum" && <ForumWindow />}
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
