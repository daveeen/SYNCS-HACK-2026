# Graveyard

> Paste a startup idea. Meet the real companies that already tried it — and find
> out what actually killed them.

SYNCS Hack 2026. **Backend: [docs/backend-readme.md](docs/backend-readme.md)** —
every endpoint, the pipeline, setup and the traps.

Read **[CLAUDE.md](CLAUDE.md)** (the rules) and
**[GRAVEYARD_TEAM_PLAN.md](GRAVEYARD_TEAM_PLAN.md)** (the plan) before writing code.

## Setup

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

That's it. **No API key needed to run the app.** It boots on the 10 invented
companies in `data/startups.mock.json` and shows an amber "mock data" banner
while it does. You only need a key once you're implementing `/api/report` or the
enrich pipeline:

```bash
cp .env.example .env.local   # then paste ANTHROPIC_API_KEY
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on :3000 |
| `pnpm build` | Production build — **run this before merging** |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm pipeline:ingest` | Seed data → `data/startups.raw.json` |
| `pnpm pipeline:enrich` | Claude root-cause analysis → `data/startups.enriched.json` |
| `pnpm pipeline:embed` | Local MiniLM vectors → back into the enriched JSON |
| `pnpm pipeline` | All three in order |

> `pnpm typecheck` needs a `pnpm build` or `pnpm dev` to have run at least once —
> Next 16 generates the `PageProps`/`LayoutProps` global types into `.next/types`.

## Layout

```
app/
  page.tsx              landing (placeholder)     Darryl + Sam
  graveyard/            results page (placeholder) Darryl + Sam
  components/           shared UI                  Sam
  api/
    README.md           ← THE API CONTRACT. Read before touching a route.
    search/route.ts     idea → matches + report    Yeriel
    report/route.ts     Claude diligence report    Yeriel
    reconstruct/route.ts Wayback snapshot          Yeriel
lib/
  types.ts              ← THE DATA CONTRACT. Import; never redefine.  Yeriel
  data.ts               loads enriched-or-mock startups
  embed.ts              the one embed() wrapper (swappable)           Yeriel
  search.ts             keyword ranking — TEMPORARY, delete when embed() lands
  claude.ts             server-only Anthropic client + model ids
data/
  README.md             pipeline flow + seed sources + quality rules  Asher
  startups.mock.json    10 invented companies (frontend unblocker)
  startups.enriched.json  the real cargo. starts as []                Asher
scripts/pipeline/       ingest → enrich → embed (tsx)                 Asher
docs/                   research, pitch, demo script                  Davin
```

## Current state — everything is a stub

Nothing calls Claude and nothing embeds anything yet. That is deliberate: the
contracts are frozen so all five of us can work in parallel from hour zero.

Two safety rails you should not remove:

- **Amber "mock data" banner** — visible while the app serves invented
  companies. Disappears on its own when `data/startups.enriched.json` has records.
- **`x-graveyard-stub: true` header** — set by every stubbed route, and rendered
  as a badge on the results page.

Together they mean **we cannot accidentally demo fabricated data to a judge**.
Delete them only when the thing behind them is real.

## Git

```
main      ← protected-ish. only tested, demoable code.
develop   ← integration branch. branch off this.
  feat/<area>-<short>    e.g. feat/web-landing, feat/api-search, feat/data-enrich
```

Areas: `web` (frontend), `api` (route handlers), `data` (pipeline/JSON),
`docs` (research/pitch).

```bash
git checkout develop && git pull
git checkout -b feat/web-landing
# ...work...
pnpm build          # must pass
git push -u origin feat/web-landing   # PR into develop
```

Before you merge: `pnpm build` passes **and** the demo path still clicks through
(landing → paste idea → results). Don't break the demo to add a feature.

## Deploy

Vercel, project root = repo root, framework auto-detected. Set
`ANTHROPIC_API_KEY` in Vercel's environment variables (Production + Preview).
Darryl owns the deploy.
