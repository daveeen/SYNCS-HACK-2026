# Graveyard — Claude Project Rules

Read this fully before writing any code. The detailed plan is in
GRAVEYARD_TEAM_PLAN.md — read it, then your assigned section.

## What we're building
Graveyard: a founder pastes a startup idea -> we match it to REAL failed startups
that tried the same thing and explain, with Claude, WHY they died (root cause, not
just symptom) and how to avoid it. We connect existing failed-startup data +
Claude reasoning to reach founders excluded from that knowledge.

## Stack
- Single Next.js (App Router) + TypeScript + Tailwind. One codebase.
- Server logic = Route Handlers in app/api/ only.
- LLM: Anthropic Claude (@anthropic-ai/sdk), called ONLY server-side in route
  handlers. Model: claude-opus.
- Embeddings: LOCAL @xenova/transformers (Xenova/all-MiniLM-L6-v2). No embeddings
  API key.
- Data: data/startups.enriched.json is the source of truth. No database for demo.
- Deploy: Vercel.

## The data contract — DO NOT change without announcing to the team
Defined in lib/types.ts; import from there, never redefine:

type FailedStartup = {
  id: string; name: string; tagline: string; description: string;
  industry: string; foundedYear: number; diedYear: number; fundingRaised: string;
  proximateCause: string;  // symptom, e.g. "ran out of cash"
  rootCause: string;       // disease, e.g. "no product-market fit"
  timingNote: string; lesson: string;
  sources: string[];       // real URLs — never empty
  waybackUrl: string;
}
type SearchResponse = {
  query: string;
  matches: Array<FailedStartup & { similarity: number }>;
  report: string;
}

## Rules (non-negotiable)
1. Ask, don't guess. If a decision is ambiguous or hard to reverse (contract
   changes, adding a DB, auth, data shape), STOP and ask the human.
2. Ask for resources you don't have. Need an API key, dataset, source URL, or
   design asset? STOP and ask — never fake it, stub silently, or hardcode secrets.
3. Never fabricate failure data. Every real startup entry needs a real sources[]
   URL. If unverifiable, set the field to "unknown" — do not invent reasons.
4. Keys stay server-side. Claude is called only from app/api/* — never the browser.
5. Stay in your lane. Flag before editing shared files (lib/types.ts, the JSON
   data, the API contract) or another person's area.
6. Build frontend against the mock JSON first. Never block on backend or real data.
7. Small PRs off `develop`, branch feat/<area>-<short>. Verify `pnpm dev` still
   runs and the demo path still works before merging.
8. Simplest thing that demos wins. No auth, no accounts, no premature abstraction.
   We have 24-36h.
9. When you finish a task, print a one-line summary of what changed, whether the
   demo still runs, and what you need next.

## Ownership
- Darryl: app flow + page composition/routing, integration, deploy. Owns develop
  merges. Tie-breaker on contract changes.
- Sam: frontend + branding/visual system (graveyard aesthetic, readable+accessible).
  Owns app/components/ and the tokens in globals.css.
- Yeriel: route handlers (/api/search, /api/report, /api/reconstruct) + lib/types.ts
  + the embed() wrapper.
- Asher: data pipeline + enriched JSON quality (the cargo). NO database — the
  source of truth is the committed JSON file. Owns the ~50 breadth entries.
- Davin: research/PM + pitch + demo script. Curates the 5 HERO startups (deepest
  paper trail, best Wayback snapshots) and QAs data accuracy.

Darryl and Sam both work on the frontend. To avoid collisions: Sam owns
app/components/ and the design tokens; Darryl owns page composition and routing
(app/page.tsx, app/graveyard/page.tsx). Same design conversation, different files.

## Seed data is two tiers — do not conflate them
- 5 HERO startups (Davin): deeply researched, verified sources, good Wayback
  snapshots. These carry the planted demo ideas and the reconstruction reveal.
- ~50 BREADTH startups (Asher): bulk-ingested, lighter enrichment. Nobody reads
  these closely. They exist so an arbitrary judge-typed idea finds a real match
  instead of a 0.19 similarity to something irrelevant.
Both land in data/startups.enriched.json in the same FailedStartup shape.

## Design: do not build AI slop (Sam's list — she owns the visual system)

Judges have seen forty of these this weekend. Every item below is a tell that
the page was generated rather than designed. Avoid them:

1. Harsh gradients
2. Lucide icons
3. Pure white background
4. Rainbow colouring
5. Drop shadows
6. 3 feature cards in a row
7. Emojis
8. Liquid Glass
9. Em dashes (this one is about COPY, not layout — applies to all UI text)
10. Inter / Geist / Space Grotesk
11. Coloured left stripe
12. Fake testimonials
13. Bento grids
14. Terminal window
15. "It's not x, it's y"
16. Checkmark bullets
17. 3 pricing tiers
19. Soft corner radius
20. Purple and black
22. Radial orbs
23. Dot grids
24. Sparkle icons
25. Animated arrows
28. Gratuitous hover animation (cards scaling, glowing, lifting) — this is NOT a
    ban on hover and focus states themselves, see clarification below
29. Neon colours
30. Basic pastel colours

### The inverted four — slop LACKS these, so we must HAVE them
Items 18, 21, 26 and 27 on Sam's list are things AI-generated sites are missing.
Do not read them as bans:

- **18. Real product demos** — the live semantic match IS the demo. Never
  replace it with a static mockup or a video.
- **21. Skeleton loaders** — a real Claude report takes 5-8s. Show real loading
  state. A frozen screen reads as broken.
- **26/27. TOS + privacy policy** — no auth, no accounts, no data collected, so
  there is nothing to write a policy about. If we ever add a footer, an honest
  "we store nothing" line beats a fabricated policy. Never generate fake legal text.

### Two clarifications so the list doesn't backfire
- **28. Hover animations** — the tell is gratuitous motion (cards scaling,
  glowing, lifting). Interactive elements still need a visible hover and focus
  state, or the page fails accessibility. Kill decoration, keep affordance.
- **5 / 19. Drop shadows and corner radius** — the tell is uniformity: the same
  soft shadow and the same `rounded-lg` on every surface. A deliberate, varied
  treatment is a design choice. Blanket-default is the slop.

### Consequence for existing code
app/globals.css and app/graveyard/ResultsClient.tsx are placeholder scaffold and
violate several of these. They were always marked throwaway — Sam replaces them.
app/layout.tsx currently loads Geist (item 10) from the Next.js template; it must
be swapped when Sam picks type.
