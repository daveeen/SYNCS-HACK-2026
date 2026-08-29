# Search UX flow — wiring the Spotlight bar to the API

For Yeriel. This is the frontend side of `/api/search` and `/api/report`: what
the user sees at every step, which component owns it, and the exact code to
add. The contract in `lib/types.ts` does not change.

**The good news: you can wire this today.** `/api/search` already returns real
records from `data/startups.enriched.json`, keyword-ranked, with a canned
report. So the whole UI can be built and tested against the stub, and it keeps
working unchanged when you swap `rankByKeyword` for embeddings. Nothing here
waits on `embed()`.

---

## 1. The flow in one line

> Type an idea into Spotlight → matches appear fast → Claude's report streams
> in underneath them → each match can be opened as its own window.

---

## 2. Use two calls, not one

`SearchResponse` carries both `matches` and `report`, so one call to
`/api/search` is possible. **Don't.** Do this instead:

| Step | Call | Latency | What the user sees |
|---|---|---|---|
| 1 | `POST /api/search` | fast (local embeddings) | Matches render immediately |
| 2 | `POST /api/report` | 5-8s (Claude) | Skeleton under the matches, then the report |

Why it matters: matching is local and quick, the Claude call is not. One
combined call makes the user stare at nothing for eight seconds. Two calls put
real content on screen in well under a second and give the slow part its own
loading state.

`/api/report` already declares `maxDuration = 60` and takes
`ReportRequest { query, matches }`, so it is built for exactly this.

> `CLAUDE.md` treats skeleton loaders as **required**, not banned (item 21 is
> one of the inverted four). A frozen screen for eight seconds reads as broken.

---

## 3. States

```
idle ──submit──> searching ──ok──> matches ──> reporting ──ok──> complete
                     │                              │
                     ├── no matches ──> empty       └── fail ──> report-failed
                     └── fail ────────> error            (matches still shown)
```

| State | Trigger | UI |
|---|---|---|
| `idle` | default | Spotlight bar only |
| `searching` | Enter pressed | Bar shows a spinner; disable resubmit |
| `matches` | `/api/search` 200 | Results window opens with match cards |
| `empty` | 200 but nothing above the floor | Honest empty state, see §6 |
| `reporting` | matches rendered | Skeleton block under the matches |
| `complete` | `/api/report` 200 | Report rendered as Markdown |
| `report-failed` | report call fails | Keep the matches, show a retry on the report only |
| `error` | search call fails | Message in the bar, query preserved |

A failed report must never discard the matches. They are independently useful.

---

## 4. The wiring

### 4a. `SpotlightBar` already has the seam

It takes one optional prop, `onSubmit(query: string)`. With no prop, Enter says
"Search is not connected yet." That is the only thing to replace.

### 4b. In `Desktop.tsx`

```tsx
const [search, setSearch] = useState<SearchState>({ kind: "idle" });

const runSearch = useCallback(async (query: string) => {
  setSearch({ kind: "searching", query });
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, limit: 5 } satisfies SearchRequest),
    });
    if (!res.ok) throw new Error((await res.json() as ApiError).error);

    // The rail. See §5 — do not skip this.
    const stubbed = res.headers.get("x-graveyard-stub") === "true";
    const data: SearchResponse = await res.json();

    const real = data.matches.filter((m) => m.similarity >= SIMILARITY_FLOOR);
    if (real.length === 0) { setSearch({ kind: "empty", query }); return; }

    setSearch({ kind: "reporting", query, matches: real, stubbed });
    open("results", `Results: ${query}`, { kind: "results" });

    // Phase 2 — the slow one.
    const rep = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, matches: real } satisfies ReportRequest),
    });
    if (!rep.ok) { setSearch((s) => ({ ...s, kind: "report-failed" })); return; }
    const { report }: ReportResponse = await rep.json();
    setSearch((s) => ({ ...s, kind: "complete", report }));
  } catch (e) {
    setSearch({ kind: "error", query, message: (e as Error).message });
  }
}, [open]);
```

Then pass it down: `<SpotlightBar onSubmit={runSearch} />`.

### 4c. What still needs building

**`ResultsWindow.tsx` does not exist.** It is the one real piece of new UI.
Suggested contract:

```tsx
export default function ResultsWindow({
  state,                                   // the SearchState above
  onOpenStartup,                           // (s: FailedStartup) => void
}: ResultsWindowProps)
```

It renders, top to bottom: the query, the match cards, then the report or its
skeleton. Add `results: { width: 720, height: 620 }` to `Desktop.tsx › SIZES`
and a `{ kind: "results" }` case to the `Pane` union, exactly like `forum`.

**Reuse what exists.** `StartupWindow.tsx` already renders one `FailedStartup`
in full. A match card is a compact version of it: name, years, funding, root
cause, similarity. Clicking one should call the existing `openStartup` handler,
which opens the full window. That handler is already wired for the trash.

---

## 5. The stub rail — do not skip

While `/api/search` returns `x-graveyard-stub: true`, its matches are
**keyword-ranked, not semantic**, and the report text did not come from Claude.
`app/api/README.md` is explicit that this must not be demoed.

The header only protects us if the frontend reads it. Show a visible badge on
the results window whenever `stubbed` is true, and make it impossible to miss.
Remove the badge when the header disappears, not before.

`x-graveyard-mock-data: true` is a second, worse case: the companies are the
ten invented ones in `startups.mock.json`. Never show those to a judge.

---

## 6. The similarity floor

`lib/search.ts` is honest that keyword scoring has no semantic understanding:
"grocery delivery" hits, "food logistics" does not. Real embeddings fix that,
but even then an unrelated idea will return *something* — the top 5 always come
back, however weak.

**Pick a floor and show an honest empty state below it.** A 0.19 match presented
as a real one is worse than saying nothing:

```ts
const SIMILARITY_FLOOR = 0.35;   // tune once embeddings are in
```

The empty state should say plainly that nothing in the archive tried this, and
that this is information rather than a failure. Do not pad the list to five.

The ~50 breadth records exist precisely so an arbitrary judge-typed idea finds
a real match instead of a weak one, so the floor should rarely fire. If it
fires often after embeddings land, that is a data-coverage signal for Asher.

---

## 7. Edge cases

| Case | Behaviour |
|---|---|
| Empty or whitespace query | Bar already ignores it. No request. |
| Same query submitted twice | Ignore while `searching` or `reporting`. |
| Very long idea (>2000 chars) | Send it; the route trims. Do not truncate in the UI. |
| Search 400 | Show `error.error` verbatim; keep the text in the bar. |
| Report times out | `report-failed`. Keep matches, offer retry on the report alone. |
| User closes the results window mid-flight | Let the fetch settle and drop the result. Do not reopen the window. |
| Second search while one is running | Newest wins. Guard with a request id or `AbortController`. |

---

## 8. Boundary

**Yours (`app/api/*`, `lib/*`)** — real `embed()`, cosine ranking, the Claude
prompt in `/api/report`, dropping the stub headers when each becomes real.

**Frontend (`app/components/*`)** — `ResultsWindow`, the match card, skeletons,
empty and error states, the stub badge.

**Shared, announce before changing** — `lib/types.ts`. Nothing in this document
requires a contract change; if you think it does, that is a conversation first
(CLAUDE.md rule 5, Darryl is tie-breaker).

---

## 9. Existing surface you can lean on

- `SpotlightBar.tsx` — entry point, `⌘K` focuses it, fakes nothing today
- `StartupWindow.tsx` — full render of one `FailedStartup`, including sources
  and the Wayback link
- `Window.tsx` — chrome for free: drag, close, collapse, zoom, Escape, internal
  scroll. A results window is `<Window>` plus content.
- `Desktop.tsx` — `open(id, title, pane, meta)` opens a window; `openStartup(s)`
  opens one company. Both already work.
- Tokens in `app/globals.css` (`--gy-*`); see `docs/os-shell.md` for the system.
