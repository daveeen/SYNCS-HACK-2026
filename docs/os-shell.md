# The OS shell — what landed in this phase

Read this before touching `app/`. It explains what exists, who owns what, and
the two places the shell is deliberately unfinished so Sam and Yeriel can plug
in without reading every file.

Branch: `landing-page`. Stack is unchanged: Next 16 (App Router), React 19,
TypeScript, Tailwind v4 (CSS-first, no `tailwind.config.js`).

---

## 1. The product is now a desktop

The frontend was at zero after `f30cd2d`. What replaced it is an **OS shell**:
a desktop with folders, draggable windows, a dock, a menubar, and a Spotlight
search bar.

The metaphor is load-bearing, not decoration. **The trash is the graveyard.**
Failed startups were thrown away, so the dock's bin opens a folder full of
folders, one per dead company. The desktop folders hold our own documents.

**The product is now called "Archived", not "Graveyard".** Renamed in the
browser title, the menubar, the masthead and the `read_me` copy.

Deliberately NOT renamed, because they are Yeriel's contract and the rail that
stops anyone demoing fake data:
- `package.json` still says `"name": "graveyard"`
- the API still emits `x-graveyard-stub` and `x-graveyard-mock-data`
- `app/api/README.md` still documents them under those names

Rename them as a separate, announced change or not at all.

---

## 2. File map

```
app/
  globals.css          design tokens          -> Sam owns
  cursors.css          pixel cursor set       -> Sam owns
  layout.tsx           fonts + metadata       -> Darryl
  page.tsx             server component, loads the JSON -> Darryl
  components/
    Desktop.tsx        window manager + composition
    Window.tsx         chrome: drag, traffic lights, zoom, collapse
    Menubar.tsx        top strip
    Dock.tsx           magnifying dock
    DesktopIcon.tsx    one icon, on wallpaper or in a window
    FolderGlyph.tsx    all icon artwork + the ICONS registry
    SpotlightBar.tsx   search entry point     -> Yeriel plugs in here
    ForumWindow.tsx    EMPTY                  -> Sam builds here
    TrashWindow.tsx    the 173 dead companies
    StartupWindow.tsx  one dead company
    DocWindow.tsx      one desktop document
lib/
  desktop-content.ts   copy for the desktop folders
```

`page.tsx` reads `data/startups.enriched.json` (173 records) server-side and
hands it to `Desktop`. No fetch on first paint.

---

## 3. For Sam — the visual system

### Tokens (`app/globals.css`)

Everything is a `--gy-*` custom property on `:root`. Change values freely; the
structure is the part worth keeping. Four things are deliberate:

1. **A documented z-index ladder** (`--gy-z-desktop` … `--gy-z-ctx`). Never
   write a raw z-index in a component; add a rung instead.
2. **Radii varied by role**, not one blanket radius:
   `--gy-r-folder: 2px` (file objects stay sharp), `--gy-r-field`, `--gy-r-icon`,
   `--gy-r-window: 10px`, `--gy-r-dock: 16px`, `--gy-r-pill`.
3. **Layered elevation.** `--gy-e-object` is drop shadow + inset top highlight
   + inset bottom shade. Three parts is what makes a surface read as a physical
   object. Reserved for things you could pick up.
4. **A dense type scale.** Chrome sits at 10-13px; only the company name and
   the masthead get to be large.

Fonts are loaded in `layout.tsx` via `next/font`: **Newsreader** (display),
**IBM Plex Sans** (UI), **IBM Plex Mono** (years, funding, IDs).

### Vibrancy

Chrome is real glass: menubar, dock, window titlebars and the Spotlight bar all
use `backdrop-filter: saturate(180%) blur(24-34px)` over the wallpaper.

**Window bodies stay at 97.5% opacity on purpose.** Making them properly
translucent lets the desktop show through the prose, which reads as a rendering
bug. macOS does the same: vibrancy on chrome, opaque content.

### Cursors (`app/cursors.css`)

Classic bitmap arrow and pointing hand, generated as one `<rect>` per run of
pixels with `shape-rendering: crispEdges` at 2x.

**Gotcha that cost a 500 error:** a raw `"` or `#` inside a CSS data URI ends
the token early and fails the whole stylesheet
(`Parsing CSS source code failed: Unexpected token Ident("http")`). The SVG uses
single-quoted attributes and named colours for exactly this reason. Do not
"tidy" it back to double quotes.

### Your canvas: `ForumWindow.tsx`

It is intentionally empty. Everything around it is done: the dock item, window
chrome, drag, close/collapse/zoom, Escape, internal scroll. Replace the one
placeholder return. Window size is `Desktop.tsx › SIZES.forum`.

---

## 4. For Yeriel — the search seam

`SpotlightBar.tsx` takes **one optional prop**, `onSubmit(query: string)`.
That is the whole integration surface. The handler body to drop in is written
out in the file header:

```ts
const res = await fetch("/api/search", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query, limit: 5 } satisfies SearchRequest),
});
const data: SearchResponse = await res.json();
// then open a results window with data.matches and data.report
```

Typed against `lib/types.ts`, so it compiles as soon as the route is real.

**Two things to honour:**

- **Check `x-graveyard-stub` before rendering anything.** While that header is
  present the route returns invented companies and must not be shown. That rail
  only works if the frontend actually reads it. `app/api/README.md` is the spec.
- **The bar fakes nothing today.** With no `onSubmit`, pressing Enter says
  "Search is not connected yet." A search box that invents plausible results is
  the worst thing to have on screen in front of judges.

There is **no results UI yet.** Opening a results window from `data.matches` is
unclaimed work. `StartupWindow.tsx` already renders a single `FailedStartup`
and can be reused for each match.

`⌘K` focuses the bar. `⌘Space` belongs to the OS and cannot be intercepted from
a browser tab, so we do not pretend to own it.

---

## 5. Interaction notes

**Window** — drag by the titlebar (clamped so it can never be lost off-screen),
Escape closes the focused one. Traffic lights are real: red closes, amber rolls
the window up to its titlebar, green zooms to fill the stage and restores.
Double-clicking the titlebar zooms. Lights grey out when unfocused.

**Dock** — true macOS magnification: every item scales by its distance from the
pointer with a cosine falloff (`RADIUS = 130`, `MAX_SCALE = 1.6`), so neighbours
swell too. Item centres are cached on enter and resize so `pointermove` does no
layout reads. Keyboard focus drives it, and `prefers-reduced-motion` disables it.

> **Do not add a `translateY` lift to the dock transform.** `transform-origin:
> bottom center` already pins the icon base and grows it upward. A translate
> after a scale is applied in scaled space, multiplies by the scale factor, and
> tears the icon off the strip. There is a comment on it.

Only the item under the pointer shows its label. Keying that off "is this item
grown" lights up every neighbour at once, because falloff grows them too.

---

## 6. Design rules: what was overridden

`CLAUDE.md` still lists the anti-slop rules and they still apply by default.
**Darryl explicitly overrode them for this shell.** If you are reading
`CLAUDE.md` and this UI looks like a violation, this is why:

| Rule | Status here | Why |
|---|---|---|
| 8 — Liquid Glass | **Overridden** | The shell is a macOS pastiche; vibrancy is the point. Explicitly requested. |
| 1 — harsh gradients | **Overridden** | The wallpaper is a seven-stop blue gradient. It is a wallpaper. |
| 2 — no icon libraries | Honoured | Every glyph is hand-drawn SVG in `FolderGlyph.tsx`. No Lucide, no emoji. |
| 5 / 19 — shadows and radii | Honoured | Varied by role, which was always the real rule. |
| 9 — no em dashes | Honoured in UI copy, **broken by the data** (see gaps) |
| 10 — no Inter/Geist/Space Grotesk | Honoured | Newsreader / IBM Plex. |

Anything not listed still stands.

---

## 7. Known gaps

- **No results UI.** The search bar has nowhere to put matches yet.
- **The forum is empty.** By design; it is Sam's.
- **Em dashes in the dataset.** `data/startups.enriched.json` has 166 en/em
  dashes across user-facing fields: 112 records in `timingNote`, 33 in
  `rootCause`, 2 in `proximateCause`. They render straight into the window and
  break design rule 9. Untouched because the data is Asher's and it is his call
  whether to normalise.
- **Mobile is unverified.** The shell renders at 390px but no touch interaction
  has been tested. A desktop metaphor on a phone needs its own thinking.
- **Safari caches localhost hard.** If a style change does not appear, it is
  almost certainly this, not your code. Use ⌘⌥R (Reload From Origin, Option not
  Shift) or Develop → Disable Caches. This cost real time once already.
