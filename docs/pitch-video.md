# Pitch video — shotlist + script

Owner: **Davin**. Runtime: **≤ 3:00** (hard cap). Format: **talking head + screen capture**.

This is the recorded submission video. It follows the same beats as the live
90-second pitch in [`pitch.md`](./pitch.md) — hook → demo → theme → model — with
room to breathe and a fuller demo. The live pitch is the compressed version of
this one; keep the wording consistent between the two whenever either changes.

The demo segment centres on the **root-cause report** (proximate vs root cause,
timing, lesson, sources). The semantic match is a short lead-in to it; the
Wayback reconstruction is an optional insert with a fallback, not the spine.

---

## Rules for the shoot

- **The demo segment is pre-recorded on a planted idea** (see the planted-ideas
  list in [`research.md`](./research.md)). Do **not** screen-capture a live
  network call in the video — a 429 or a slow Wayback fetch wastes a take.
  Record the happy path once it is clean on the deployed URL, then narrate over
  the recording.
- **The Wayback reveal (shot 6) is optional.** If `/api/reconstruct` is solid at
  shoot time, include it. If it is flaky, cut it — the video must not hinge on
  the riskiest feature. The root-cause report (shot 5) carries the demo on its
  own.
- Every on-screen claim about a real company must be one we can cite. Keep the
  `sources[]` row visible while the report is on screen.
- Talking-head + screen ≤ 3:00 total. If it runs long, cut from the problem
  setup (shots 2–3), **never** from the demo.

## Capture checklist

- [ ] Screen capture at 1920×1080 or higher, 60 fps if the machine allows
- [ ] Browser: bookmarks bar hidden, one clean window, no extension icons
- [ ] Dark theme — check tombstone-text contrast **on the exported file**, not just live
- [ ] Notifications off (OS + browser), Do Not Disturb on, phone silent
- [ ] External mic; record 5s of room tone for the editor
- [ ] Talking head: even front light, plain background, lens at eye level
- [ ] 2–3 takes of every talking-head shot; leave 1s of silence at head and tail of each take
- [ ] Export with captions (burned in or as a sidecar `.srt`)
- [ ] Final file named `graveyard-pitch.mp4`, check it plays with sound on a second device

---

## Shotlist

| # | Type | Dur | On screen | Script | Notes |
|---|------|-----|-----------|--------|-------|
| 1 | Talking head | 0:00–0:18 | Presenter, centre frame | Hook | Cold open — no title card before it. Energy up. |
| 2 | Talking head + b-roll | 0:18–0:42 | Presenter; cut to screen b-roll of a web search for the planted idea returning nothing useful | Problem | The b-roll is a real search showing thin/irrelevant results |
| 3 | Talking head → screen | 0:42–0:58 | One line to camera, then cut to the Graveyard landing page | What it is | Landing page pre-loaded, cursor already in the idea box |
| 4 | Screen + VO | 0:58–1:18 | Type the planted idea, press enter, tombstone cards animate in with similarity scores | Demo A | Type at readable speed; let the cards settle before talking over them |
| 5 | Screen + VO | 1:18–2:08 | Click one tombstone. Report opens. Scroll slowly: proximate cause → root cause → timing note → lesson → sources | Demo B | **Longest hold in the video.** Cursor-highlight "proximate" then "root cause" as you say each. Pause on the sources row. |
| 6 | Screen + VO | *(opt.)* 2:08–2:20 | Click Reconstruct; the dead company's real old homepage loads in the viewer | Demo C | **OPTIONAL** — cut entirely if reconstruct is not reliable. If cut, shot 5 runs to ~2:15. |
| 7 | Talking head | 2:20–2:42 | Presenter | Theme | Slow down. This is the point of the project. |
| 8 | Talking head → end card | 2:42–3:00 | One line to camera; cut to end card — name, tagline, URL | Model + close | End card holds the last ~3s in silence |

Timings above assume shot 6 is **in**. If it is cut, pull shots 7–8 earlier and
end around 2:45 — under is fine, over is not.

---

## Full script

Times are cumulative. `[BRACKETS]` = fill in before shooting.

### Shot 1 — Hook · 0:00–0:18 · talking head

> "A teammate of mine — [TEAMMATE NAME] — had a startup idea he was sure was
> original: [THE IDEA, one clause]. He searched for anyone who'd tried it.
> Nothing came up, so he figured the coast was clear.
>
> It wasn't. Failed startups disappear from the internet *because* they failed."

### Shot 2 — Problem · 0:18–0:42 · talking head + b-roll

> "When a company dies, the domain lapses, the blog goes dark, the founders move
> on and don't advertise the wreck. The lesson dies with it.
>
> The people who keep that knowledge are inside venture networks. A YC founder
> hears 'three teams tried that, here's how each one died' over coffee. If
> you're a first-generation founder, or you're not in that city, or you just
> don't know those people — you find out the expensive way."

### Shot 3 — What it is · 0:42–0:58 · talking head → screen

> "So we built Graveyard. You paste in your startup idea, and it finds the real
> companies that already tried it — and tells you what actually killed them."

*(cut to the landing page)*

### Shot 4 — Demo A: the match · 0:58–1:18 · screen + VO

> "This is the idea [TEAMMATE NAME] had. I paste it in.
>
> Graveyard embeds it and matches it against a corpus of real failed startups.
> This runs on a local embedding model, so there's no per-query cost. These
> aren't keyword hits — each of these companies tried something close to this
> idea, ranked by how close."

### Shot 5 — Demo B: the root cause · 1:18–2:08 · screen + VO

> "Open one. Every graveyard site will tell you a company 'ran out of money' —
> that's the *symptom*. The real killer is usually the boring one: they built
> something people didn't want badly enough to pay for. That's the disease.
>
> Graveyard separates the two. Proximate cause: what the obituary said. Root
> cause: what actually went wrong, reasoned out by Claude from the post-mortem.
> A timing note — was this simply too early. And the one lesson to carry into
> your own version.
>
> And every claim here is cited. These are real sources — a founder's own
> write-up, a CB Insights post-mortem. Nothing on this screen is invented; if we
> can't cite it, we don't show it."

### Shot 6 — Demo C: the reconstruction · 2:08–2:20 · screen + VO · OPTIONAL

> "One more thing. This company's site has been offline for years. Graveyard
> pulls their last live homepage out of the Internet Archive and rebuilds it
> right here — so you can see exactly what they promised, and what the market
> said no to."

### Shot 7 — Theme · 2:20–2:42 · talking head

> "The failure data already exists. Claude's reasoning already exists. What's
> been missing is the line between them and the founder who isn't in the room
> where this stuff gets said out loud.
>
> That's Graveyard. It takes the lesson that used to need a network and gives it
> to anyone with an idea and a browser."

### Shot 8 — Model + close · 2:42–3:00 · talking head → end card

> "It's free for founders. The paid side is a diligence API for the investors
> and accelerators who screen hundreds of ideas a month and want the graveyard
> check automated.
>
> Graveyard. Look up your idea before you spend a year of your life on it."

*(end card: name · tagline · URL · hold 3s in silence)*

---

## Cutting it down to the 90-second live version

Cut shots 2 and 6 entirely; trim shot 5 to the proximate-vs-root-cause sentence
plus the sources sentence; drop the first paragraph of shot 7. That is the
[`pitch.md`](./pitch.md) version — keep the two in sync when either changes.
