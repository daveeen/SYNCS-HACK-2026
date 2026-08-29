# Slide deck — contents

Owner: **Davin**. This is the *content* of the presentation deck — slide text,
visuals, and speaker notes. Build the actual slides in whatever tool you like;
match the visual direction below so it reads as one piece with the app.

## How to use this

- **Full deck (12 slides)** — for a 3–5 minute presentation slot with the live
  demo run off slide 7.
- **Lightning deck (5 slides)** — if the format is a 90-second pitch with no
  presentation slot: use slides **1, 4, 7, 9, 12** only. Everything else is
  narration.
- Slides are a backdrop, not a script. One idea per slide, ≤ 6 words per line
  where possible, no paragraphs. The words you *say* live in
  [`pitch.md`](./pitch.md) and [`pitch-video.md`](./pitch-video.md).

## On the punny titles

Each slide title is a graveyard/death pun; the line under it (*plain:* …) is the
literal point so the deck-builder can't lose the thread. **The joke is the title
only — every bullet underneath stays factual.** Deliver slides 9 and 10 (the
build and the data-provenance slides) straight, with no wink — that's where
credibility is won and a gag undercuts it.

## Prompt & criteria this deck is built against

> **Assumed prompt** (confirm against the official SYNCS Hack 2026 brief):
> connect two things that already exist to reach a person who is currently
> excluded from that connection.
>
> **Graveyard's answer:** public failed-startup data **+** Claude's root-cause
> reasoning → delivered to the outsider founder who has no venture network to
> learn this from.

**Judging — 70 pts:** Idea 15 · **Implementation 30 (heaviest)** · Design 15 ·
Pitch 10. Every slide below names the criterion it is working for. The deck
leans hardest on Implementation: slides 7–10 exist to prove the build is real.

| Criterion | Pts | Carried by slides |
|---|---|---|
| Idea | 15 | 2, 3, 4, 11 |
| Implementation | 30 | 6, 7, 8, 9, 10 |
| Design | 15 | the deck's own craft + slides 6–8 (product UI) |
| Pitch | 10 | 1, 5, 12 + delivery |

## Visual direction

- Graveyard aesthetic — near-black background, bone/off-white text, one accent
  (cold green or amber). **Readable first:** WCAG-AA contrast, large type,
  nothing thinner than a medium weight. Design is 15 pts and a deck that is
  atmospheric but unreadable loses them.
- Reuse Sam's tokens/typeface from the app so the deck and the product match.
- Screenshots are real product UI on real data — never mock-ups, never the amber
  "mock data" banner, never the `x-graveyard-stub` badge.
- Slide numbers + short title bottom-left. No clip art. No stock "startup" photos.

---

## Slide 1 — "Rest in Pitch"

*plain: title slide.*

**Serves:** Pitch

- **Graveyard** *(confirm final name — see open decisions in the team plan)*
- Tagline: *Look up your startup idea before you bury a year in it.*
- Team: Darryl · Sam · Yeriel · Asher · Davin — SYNCS Hack 2026
- Visual: the wordmark on near-black; a faint row of headstones along the base.

**Speaker note:** say the name and the one-line tagline, nothing more. Move.

---

## Slide 2 — "No Body Was There"

*plain: I searched for anyone who'd tried my idea and found nothing.*

**Serves:** Idea · Pitch

- "I searched for anyone who'd already tried my idea."
- "Nothing came up."
- "So I assumed it was safe."
- Visual: a near-empty search results page, greyed out.

**Speaker note:** tell it as the real story — name the teammate, name the idea.
A true anecdote outscores a hypothetical and judges can tell the difference.

---

## Slide 3 — "Unmarked Graves"

*plain: failed startups vanish from the internet because they failed.*

**Serves:** Idea

- Failed startups vanish **because** they failed.
- Domain lapses · blog goes offline · founders move on
- The lesson dies with the company.
- Visual: a live URL dissolving into a `DNS_PROBE_FINISHED_NXDOMAIN` error.

**Speaker note:** this is the insight the whole project rests on. Say it slowly.

---

## Slide 4 — "The Eulogy Only Insiders Hear"

*plain: the hard-won failure lesson is locked inside venture networks.*

**Serves:** Idea (the theme slide)

- Today: locked inside venture networks.
- "Three teams tried that — here's how each one died." *(said over coffee, to insiders)*
- First-gen / regional / outsider founders don't get that conversation.
- **Graveyard connects data that exists to the founder shut out of it.**
- Visual: two boxes — *Failure data (exists)* + *Claude reasoning (exists)* — an
  arrow from both to a third figure labelled *Founder with no network*.

**Speaker note:** name the prompt out loud here. "Connect two existing things to
reach the person excluded" — this slide *is* that sentence.

---

## Slide 5 — "We Dig Them Up"

*plain: what Graveyard does, in three steps.*

**Serves:** Pitch

- Paste your startup idea.
- Meet the real companies that already tried it.
- See what **actually** killed them — root cause, not just the symptom.
- Visual: the three steps as three headstones left-to-right.

**Speaker note:** 10 seconds. This slide just frames the demo that follows.

---

## Slide 6 — "Plots Like Yours"

*plain: demo — semantic match returns real failed startups near your idea.*

**Serves:** Implementation · Design

- Screenshot: idea box filled in + tombstone cards with **similarity scores**.
- Caption line: *Semantic match — local embedding model, no per-query cost.*
- Caption line: *Not keyword search — ranked by how close the idea actually is.*

**Speaker note:** if the live demo is running, switch to it here and come back.
If not, walk the screenshot: "each of these companies tried something close to
the idea I typed."

---

## Slide 7 — "The Autopsy, Not the Obituary"

*plain: demo — proximate cause vs root cause, timing, lesson, sources. The core slide.*

**Serves:** Implementation · Design

- Screenshot: an open tombstone report showing all four fields.
- **Proximate cause** — what the obituary said ("ran out of cash")
- **Root cause** — what actually went wrong ("no one wanted it enough to pay")
- **Timing note** — was it just too early
- **Lesson** — the one thing to carry into your version
- Bottom strip: the **`sources[]`** row, links visible.

**Speaker note:** this is the slide that wins Implementation. Every graveyard
site stops at "ran out of money" — that's the symptom. Graveyard reasons to the
disease, with Claude, and cites it. Point at the sources row.

---

## Slide 8 — "Open Casket"

*plain: demo — the dead company's old homepage, rebuilt live from the Internet Archive. Optional.*

**Serves:** Implementation · Design

- Screenshot: a dead company's real homepage rebuilt from the Internet Archive,
  inside the app.
- Caption: *Their last live site. What they promised — and what the market
  declined.*

**Speaker note:** only keep this slide if `/api/reconstruct` is reliable at
presentation time. Per the team plan's cut order, this is the second thing to
drop. If it's out, delete the slide — don't show a screenshot of a feature the
judges can't see working.

---

## Slide 9 — "How the Grave Gets Dug"

*plain: the architecture and the data pipeline. Deliver this one straight.*

**Serves:** Implementation

- One Next.js app (App Router) · TypeScript · Tailwind · deployed on Vercel
- **Claude** (`@anthropic-ai/sdk`) — server-side only, in route handlers; key
  never reaches the browser
- **Embeddings** — local MiniLM (`@xenova/transformers`), precomputed at
  pipeline time; no second API key, no cost
- **Pipeline** — `ingest → enrich (Claude root-cause) → embed` → one committed
  JSON corpus
- Visual: the data-flow arrow from the team plan —
  `seed → ingest → enrich → embed → app → /api/search → /api/report → /api/reconstruct`

**Speaker note:** 20 seconds, no jokes. The point is "this is a real system with
a real data pipeline, not a prompt in a text box."

---

## Slide 10 — "Every Grave Has a Name"

*plain: the corpus is real and cited — no invented failure data. Deliver this one straight.*

**Serves:** Implementation · Idea

- Corpus: real failed startups from CB Insights post-mortems + Failory + founder
  write-ups.
- **Every entry has a real source URL.** No citation → not in the corpus.
- Unverifiable field → the literal word `"unknown"`. We never invent a reason.
- Human QA pass on the enriched data before it ships.
- Visual: one real corpus entry with its source link highlighted.

**Speaker note:** pre-empt the "is this data real?" question before a judge asks
it. This is also an Idea-score defence — a made-up answer here would sink it.

---

## Slide 11 — "Who Pays the Undertaker"

*plain: who it's for and how it makes money.*

**Serves:** Idea · Pitch

- **Founders** — free. Check your idea against the graveyard before you commit.
- **Investors / accelerators** — paid diligence API; automate the graveyard
  check across hundreds of ideas a month.
- One line on the wedge: the people most helped are the ones without the network
  — that's the point, not a niche.
- Visual: two columns, *Founder (free)* / *Investor (API)*.

**Speaker note:** keep it to two sentences. Don't oversell the market — a
credible small claim beats an inflated one in Q&A.

---

## Slide 12 — "Before You Break Ground"

*plain: close — try it on your own idea, here's the URL.*

**Serves:** Pitch

- **Graveyard**
- *Look up your idea before you spend a year of your life on it.*
- Live URL · repo · team names
- Visual: the wordmark, the URL large and legible from the back of the room.

**Speaker note:** say the URL, invite them to type their own idea into it, stop
talking.

---

## Appendix (hold in reserve for Q&A — don't present)

Have one honest sentence ready for each. "We don't know yet," said plainly,
beats a confident invention.

- **"Is the data real? Where's it from?"** → CB Insights post-mortems, Failory
  Graveyard, founder write-ups; every entry carries its source URL; show the row.
- **"What stops Failory or CB Insights doing this?"** → they're static lists;
  the value we add is idea→corpus matching + reasoned root cause + live
  reconstruction, not the list itself.
- **"What if Claude's root-cause analysis is wrong?"** → it's derived from a
  cited post-mortem shown alongside; it's a diligence starting point, not a
  verdict; a human reviews the corpus.
- **"What's the moat if the data is public?"** → the matching + reasoning layer
  and the update loop, not the database. The old graveyard sites died from no
  update loop.
- **"How big is the corpus?"** → ~50 curated, fully-cited entries for this
  build, chosen for source quality and Wayback coverage; the pipeline scales to
  the full CB Insights set.
