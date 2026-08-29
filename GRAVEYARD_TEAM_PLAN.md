# Graveyard — Team Build Plan

> Drop this file into the **root of the hackathon repo** (next to `CLAUDE.md`) so everyone's Claude reads it.
> If you're a teammate opening this with Claude Code: read this whole file, then read the root `CLAUDE.md`, then jump to **your section** in §4 and the rules in §5–6 before writing any code.

---

## 0. What we're building (and why it wins)

**Graveyard** — a founder pastes their startup idea, and we show them the **real failed startups that already tried it**, with Claude-reasoned analysis of *why they died* and *how to avoid the trap*.

We are **connecting two things that already exist** — public failed-startup data + Claude's reasoning — to reach the person excluded from that knowledge. The old "startup graveyard" sites (Autopsy.io, Failory) are static, shallow spreadsheets that mostly died from no update loop. **The database is NOT our moat.** Our moat is: **semantic matching (your idea → the corpses that match it) + Claude root-cause reasoning + live Wayback reconstruction of the dead company's actual site.**

**Theme framing (say this in the pitch, verbatim):** hard-won failure knowledge is currently locked inside elite VC networks — a YC insider hears "three teams died doing that, here's why" over coffee. A **first-gen / regional / outsider founder has no such network.** Graveyard democratizes that buried knowledge to the founders without the rolodex. *That* is on-theme: connect an existing block (failure lessons) to the person excluded from it.

**Judging (70 pts):** Idea 15 · **Implementation 30 (heaviest — the live semantic-match + Wayback reveal is the swing factor)** · Design 15 · Pitch 10. Optimize for the Implementation demo path above all else.

---

## 1. Stack & architecture

- **One Next.js app** (App Router) + **TypeScript** + **Tailwind**. Single codebase, no separate backend server.
- **Server logic = Route Handlers** under `app/api/`: `/api/search`, `/api/report`, `/api/reconstruct`.
- **LLM:** Anthropic **Claude** (`@anthropic-ai/sdk`), called **only** from route handlers so the key stays server-side. `claude-opus` for report quality.
- **Embeddings:** **local** MiniLM via `@xenova/transformers` — **no second API key, no cost.** Precompute at pipeline time, embed the user's query at request time. Wrapped in one `embed()` function so it's swappable.
- **Data:** a committed JSON file `data/startups.enriched.json` is the **source of truth for the demo.** No database needed. (Supabase/pgvector is an *optional stretch* only if we add self-submissions — not for the demo.)
- **Pipeline:** TS scripts (`scripts/pipeline/`, run with `tsx`) that turn seed data → enriched JSON.
- **Deploy:** Vercel.

**Data flow:**
`seed CSV → ingest.ts → enrich.ts (Claude adds root cause) → embed.ts (local vectors) → data/startups.enriched.json → app reads it → /api/search does cosine match → /api/report asks Claude → UI renders → /api/reconstruct pulls the dead site from Wayback`

---

## 2. The shared contract (nobody breaks this without announcing it)

Defined once in `lib/types.ts`, imported everywhere:

```ts
type FailedStartup = {
  id: string
  name: string
  tagline: string
  description: string        // what they did, plain English
  industry: string
  foundedYear: number
  diedYear: number
  fundingRaised: string      // e.g. "$3.2M" or "unknown"
  proximateCause: string     // the symptom ("ran out of cash")
  rootCause: string          // the disease ("no product-market fit")
  timingNote: string         // was it timing? ("too early — pre-smartphone")
  lesson: string             // the one-line takeaway
  sources: string[]          // real URLs — NEVER leave empty
  waybackUrl: string         // Wayback snapshot of their old site, if any
}

type SearchResponse = {
  query: string
  matches: Array<FailedStartup & { similarity: number }>
  report: string             // Claude's diligence write-up for THIS idea
}
```

**Rule:** if you need to change this shape, post in the team chat first. The mock JSON and every UI component depend on it.

---

## 3. The plan — phases for a 24–36h sprint

The mock contract (§2) lets frontend and data work run **fully in parallel** from hour 0. **Critical path = Asher's enriched data + Yeriel's search/report feeding Sam & Darryl's UI.**

| Phase | Hours | Goal | Definition of done |
|-------|-------|------|--------------------|
| **0 — Scaffold** | 0–2 | Run the init prompt; everyone clones and boots it locally; agree the contract | `pnpm dev` runs for all 5; mock demo clicks through |
| **1 — Mock end-to-end** | 2–8 | Full clickable flow on **mock data** — landing → paste idea → results (tombstone cards) → report → reconstruct. Asher enriches the **first 10 real** startups. | You can demo the whole path on mock by hour 8 |
| **2 — Real cargo** | 8–18 | Asher enriches ~50 real startups. Yeriel ships real `/api/search` (local embeddings + cosine) + `/api/report` (Claude). Frontend swaps mock → real. | Typing a real idea returns real matches + a real Claude report |
| **3 — The wow** | 18–26 | `/api/reconstruct` (Wayback) + the "meet your graveyard" reveal UI. Sam does branding, tombstone visual system, accessibility. | Judge's idea → live-reconstructed dead homepage on screen |
| **4 — Seed + rehearse** | 26–32 | Davin hand-picks demo startups that match ideas judges are likely to type; writes + rehearses the pitch. Integration + bugfix. | Demo is reliable on the 3 "planted" ideas; pitch under 90s |
| **5 — Freeze & polish** | 32–36 | Deploy to Vercel, final polish, rehearse pitch twice. **No new features.** | Deployed, stable, rehearsed |

**If we fall behind:** cut in this order — (1) Supabase, (2) Wayback reconstruction (fall back to a screenshot), (3) live `/api/report` (fall back to pre-generated reports for the planted ideas). **Never cut the semantic match — that's the core.**

---

## 4. Who owns what

- **Darryl — fullstack / frontend lead + integration.** App shell, landing page, the paste-idea → results flow, wiring UI to the API routes, keeping the whole thing integrated and deployable. Owns `develop` merges and the Vercel deploy. Tie-breaker on contract changes.
- **Sam — frontend / design build.** The graveyard results UI: tombstone cards, the failure-report display, the Wayback reconstruction viewer. Owns the **branding + visual system** (graveyard aesthetic — but keep it **readable and accessible**, high contrast; Design is 15 pts). Works against mock JSON from hour 0.
- **Yeriel — backend (route handlers).** `/api/search` (embed query + cosine over vectors + return ranked matches), `/api/report` (Claude → structured diligence report), `/api/reconstruct` (Wayback Availability API + snapshot). Owns `lib/types.ts` and the `embed()` wrapper. Keeps the API contract stable.
- **Asher — data (the cargo).** The pipeline: source the seed dataset (CB Insights 483 / Kaggle mirror), clean it, run Claude enrichment (proximate vs root cause, timing, lesson), precompute embeddings, output `data/startups.enriched.json`. **This is what makes it not-a-toy — data quality is your job.** Every entry needs a real source URL.
- **Davin — research / PM / pitch.** Curate *which* ~50 startups to enrich (bias to ones with good Wayback snapshots + ideas relatable to judges). QA the enriched entries for accuracy (failure narratives are unreliable — spot-check). Own the theme framing, the 90-second pitch, and the demo script. Manage the timeline and the "planted demo ideas."

---

## 5. Rules for building any feature

Apply this checklist **before** you start each feature:

1. **Is it on the critical path for the demo?** If not, defer it. We have 24–36h.
2. **Build against the contract (§2).** Import the shared types; don't redefine shapes.
3. **Frontend builds against mock first.** Never block waiting on the backend or real data.
4. **Never fabricate failure data.** Every real entry needs a real `sources[]` URL. If you can't verify a fact, mark it `"unknown"` — do not invent it. (A judge asking "is this real?" and getting a made-up answer kills the Idea + Pitch score.)
5. **Keys stay server-side.** Claude is only ever called from `app/api/*` route handlers, never the browser.
6. **Small PRs off `develop`,** branch `feat/<area>-<short>`. Don't edit another person's workspace without a heads-up in chat.
7. **Before you merge:** confirm `pnpm dev` still runs and the demo path still clicks through. Don't break the demo to add a feature.
8. **Simplest thing that demos wins.** No auth, no accounts, no premature abstraction.

---

## 6. Rules for working with your Claude

**If you're driving Claude Code on this repo, make it follow these — paste them if needed:**

- **Read first, code second:** read root `CLAUDE.md` + this plan + your §4 section before writing anything.
- **Stay in your lane:** work in your assigned area; flag in chat before touching shared files (`lib/types.ts`, the mock/enriched JSON, the API contract).
- **Ask, don't guess:** if a decision is ambiguous or hard to reverse (changing the contract, adding a DB, an auth flow, a data shape), **STOP and ask the team** — do not silently pick.
- **Ask for resources you don't have:** if you need an API key, a dataset, a specific source URL, a design asset, or a Supabase project to proceed, **STOP and ask for it explicitly** — do not fake it, stub it silently, or hardcode secrets.
- **Don't invent data:** if you can't find a real source for a failed startup's cause, say so and leave it flagged — never hallucinate a plausible-sounding reason.
- **Report back:** when you finish a feature, print a one-line summary of what changed, whether the demo path still runs, and what you need next.
- **Respect the freeze:** in Phase 5, no new features — only bugfixes and polish.

---

## 7. Definition of done + demo script

**Done =** deployed on Vercel; a judge types their own idea; they see (1) matched dead startups as tombstone cards with real root causes, (2) a Claude diligence report on their idea, (3) at least one **live-reconstructed dead homepage** from Wayback.

**90-second demo (Davin owns):**
1. **Hook (15s):** "My teammate had a startup idea, thought it was original, searched — nothing. Turns out failed startups vanish *because* they failed. We built the tool that digs them up." 
2. **The reveal (40s):** judge types an idea live → tombstones appear → open one → "here's what killed them, root cause not just symptom" → **reconstruct their dead 2016 site on screen.**
3. **Theme (20s):** "This knowledge is normally locked in VC networks. We give it to the founders who don't have one."
4. **Model (15s):** "Free for founders; paid diligence API for the investors and accelerators who screen ideas all day."

---

## 8. Open decisions (resolve these early — Darryl/Davin)

- [ ] **Final name + domain** — "Graveyard"? "RIP.startup"? Pick by Phase 1 so branding can start.
- [ ] **The ~50 seed startups** — Davin to shortlist; bias to good Wayback snapshots + relatable ideas.
- [ ] **3 "planted" demo ideas** — pick ideas we *know* return a great graveyard, in case a judge asks us to type something.
- [ ] **Confirm the Anthropic key + budget** works and which model (`claude-opus` for report quality vs `claude-sonnet` for speed/cost) — test a real call in Phase 0.
- [ ] **Embeddings** — local MiniLM is the default (no key). Only upgrade to a hosted embeddings provider if match quality is visibly poor.

---

## Appendix — sources & resources

- **Seed data:** CB Insights "483 startup failure post-mortems" (Kaggle mirror: `dagloxkankwanda/startup-failures`), Failory Graveyard, GetAutopsy.
- **Failure taxonomy:** CB Insights top reasons (no market need, ran out of cash, out-competed, wrong team, pricing, bad timing, regulatory…). Use it as `rootCause` categories.
- **Wayback:** Internet Archive Availability API (`http://archive.org/wayback/available?url=...`) → returns the closest snapshot URL to embed/screenshot.
- **Embeddings:** `@xenova/transformers`, model `Xenova/all-MiniLM-L6-v2`, runs in Node, no key.
- **LLM:** `@anthropic-ai/sdk`, `claude-opus`.
