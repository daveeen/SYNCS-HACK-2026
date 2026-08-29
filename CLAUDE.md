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
- Darryl: fullstack/frontend lead + integration + deploy.
- Sam: frontend + branding/visual system (graveyard aesthetic, readable+accessible).
- Yeriel: route handlers (/api/search, /api/report, /api/reconstruct) + lib/types.ts
  + the embed() wrapper.
- Asher: data pipeline + enriched JSON quality (the cargo).
- Davin: research/PM, curate seed startups, pitch + demo script, QA data accuracy.
