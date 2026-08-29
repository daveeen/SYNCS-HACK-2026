# Demo script

Owner: **Davin** (script) + **Darryl** (the machine it runs on).

Scaffold stub. Fill in during Phase 4.

## The happy path

1. Land on `/`.
2. Paste the idea. **TODO:** which one? See planted ideas in `docs/research.md`.
3. Tombstones appear with similarity scores.
4. Open one — proximate cause vs **root cause**, timing, lesson, real sources.
5. **Reconstruct** — their actual dead homepage, live from the Internet Archive.

## Pre-flight checklist

Run through this before we present. Every line is something that has killed a
hackathon demo before.

- [ ] Deployed build is live on Vercel and someone has loaded it in the last 10 min
- [ ] `ANTHROPIC_API_KEY` set in Vercel **Production** (not just Preview)
- [ ] API credit balance checked — a 429 mid-demo is unrecoverable
- [ ] Mock-data banner is **gone** (real data is loading)
- [ ] No `x-graveyard-stub` badge on the results page
- [ ] All 3 planted ideas return good graveyards **on the deployed URL**, not localhost
- [ ] Wayback snapshot for the hero startup loads (and is cached — see below)
- [ ] Browser zoom set for projector legibility; dark theme readable on their screen
- [ ] Laptop on power, notifications off, one clean browser window
- [ ] Phone hotspot ready — venue wifi is the single most likely failure

## Fallbacks — decide these BEFORE we're on stage

| If this breaks | Do this |
|---|---|
| Wayback is slow or refuses to iframe | Pre-captured screenshot, already open in a tab |
| Claude report takes >8s | Pre-generated report for the planted idea |
| Network dies entirely | Local build on the hotspot; last resort, a recorded screen capture |
| A judge types something that returns junk | Say so honestly, then show a planted one. Don't pretend a bad match is a good one — they can read the screen. |

**Rule:** the fallback must be reachable in under 5 seconds without typing. Open
the tabs before we go up.

## Timing

Whole thing under 90 seconds. **TODO:** rehearse twice with a stopwatch in
Phase 5, once with the fallbacks deliberately triggered.
