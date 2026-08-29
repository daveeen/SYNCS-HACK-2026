# Build schedule — 36 hours

Owner: **Darryl**. Derived from the phase table in [GRAVEYARD_TEAM_PLAN.md](../GRAVEYARD_TEAM_PLAN.md).

Hours are **offsets from kickoff**, not clock times. The Gantt below is anchored
to a placeholder start of `2026-09-01 09:00` — shift every date by the same
amount if we start elsewhere. Phase 0 is done.

## Gantt

```mermaid
gantt
    title Graveyard — 36h build
    dateFormat YYYY-MM-DD HH:mm
    axisFormat %a %Hh
    todayMarker off

    section Darryl (integration)
    Scaffold                      :done, sc, 2026-09-01 09:00, 2h
    Push develop + Vercel skeleton :active, d1, 2026-09-01 11:00, 2h
    CONTRACT DECISION (Q1)        :crit, d2, 2026-09-01 11:00, 1h
    Landing + results flow (mock) :d3, 2026-09-01 13:00, 6h
    Swap mock to real             :crit, d4, 2026-09-02 07:00, 4h
    Integration + bugfix          :crit, d5, 2026-09-02 11:00, 6h
    Deploy + freeze               :crit, d6, 2026-09-02 17:00, 4h

    section Davin (research/PM)
    3 planted demo ideas          :crit, v1, 2026-09-01 11:00, 3h
    Curate ~50 shortlist          :crit, v2, 2026-09-01 14:00, 7h
    Theme framing + pitch draft   :v3, 2026-09-01 21:00, 6h
    QA enriched accuracy          :v4, 2026-09-02 05:00, 8h
    Demo script + fallbacks       :v5, 2026-09-02 09:00, 4h
    Rehearse x2                   :v6, 2026-09-02 17:00, 4h

    section Yeriel (backend)
    embed() implementation        :crit, y1, 2026-09-01 11:00, 4h
    VERCEL SMOKE TEST (Q2)        :crit, y2, 2026-09-01 15:00, 2h
    /api/search real (cosine)     :y3, 2026-09-01 21:00, 6h
    /api/reconstruct (Wayback)    :y5, 2026-09-02 03:00, 4h
    /api/report (Claude)          :y4, 2026-09-02 07:00, 6h
    Cache + demo fallbacks        :y6, 2026-09-02 13:00, 3h

    section Asher (data)
    Seed dataset + ingest.ts      :crit, a1, 2026-09-01 11:00, 6h
    First 10 real enriched        :crit, a2, 2026-09-01 17:00, 4h
    Enrich ~50                    :crit, a3, 2026-09-01 21:00, 8h
    Run embed pipeline            :crit, a4, 2026-09-02 05:00, 2h
    Wayback URLs for seed set     :a5, 2026-09-02 07:00, 3h
    Data QA fixes                 :a6, 2026-09-02 13:00, 4h

    section Sam (frontend/design)
    Visual system + tokens        :s1, 2026-09-01 11:00, 6h
    Tombstone cards (mock)        :s2, 2026-09-01 17:00, 6h
    Report display (markdown)     :s3, 2026-09-01 23:00, 4h
    Reconstruct viewer            :s4, 2026-09-02 03:00, 6h
    Accessibility + contrast      :s5, 2026-09-02 09:00, 4h
    Visual polish                 :s6, 2026-09-02 17:00, 4h
```

## What depends on what

```mermaid
flowchart LR
    sc([Scaffold<br/>DONE])

    subgraph gates [Hard gates]
        d2{{"Q1 contract decision<br/>Darryl · by h3"}}
        y2{{"Q2 Vercel embed test<br/>Yeriel · by h8"}}
    end

    sc --> d1[Darryl: develop + Vercel]
    sc --> d2
    sc --> v1[Davin: 3 planted ideas]
    sc --> y1[Yeriel: embed]
    sc --> a1[Asher: ingest.ts]
    sc --> s1[Sam: visual system]

    y1 --> y2
    d1 --> y2

    v1 --> v2[Davin: curate 50]
    v1 --> a2[Asher: first 10 enriched]
    a1 --> a2
    a2 --> a3[Asher: enrich 50]
    v2 --> a3
    a3 --> a4[Asher: embed pipeline]
    y1 --> a4
    a3 --> a5[Asher: wayback URLs]
    a3 --> v4[Davin: QA accuracy]

    y2 --> y3[Yeriel: /api/search]
    a2 --> y3
    y2 --> y5[Yeriel: /api/reconstruct]
    a5 --> y5
    y3 --> y4[Yeriel: /api/report]
    d2 --> y4

    s1 --> s2[Sam: tombstone cards]
    s2 --> s3[Sam: report display]
    d2 --> s3
    s3 --> s4[Sam: reconstruct viewer]
    s4 --> s5[Sam: a11y + contrast]

    a4 --> d4[Darryl: swap mock to real]
    y3 --> d4
    v4 --> a6[Asher: QA fixes]
    v3[Davin: pitch draft] --> v5[Davin: demo script]
    y4 --> y6[Yeriel: cache + fallbacks]
    y5 --> y6
    v5 --> y6

    d4 --> d5[Darryl: integration + bugfix]
    s5 --> d5
    y6 --> d5
    a6 --> d5
    d5 --> d6[Darryl: deploy + freeze]
    d6 --> v6[Davin: rehearse x2]

    classDef crit fill:#7f1d1d,stroke:#ef4444,color:#fff
    classDef gate fill:#78350f,stroke:#f59e0b,color:#fff
    class v1,v2,a1,a2,a3,a4,d4,d5,d6 crit
    class d2,y2 gate
```

## The critical path — zero slack

```
Scaffold → 3 planted ideas (Davin) → first 10 enriched (Asher)
        → enrich 50 → embed pipeline → swap to real (Darryl)
        → integration + bugfix → deploy + freeze
```

**The non-obvious part: Davin is on the critical path at hour 2.** The planted
demo ideas gate the seed curation, which gates the entire enrichment chain,
which gates integration. A research task blocks all the engineering. If Davin's
shortlist slips 3 hours, the deploy slips 3 hours.

Everything else has slack. Sam's whole track and Yeriel's report work can run
late without moving the finish — which is also why **they are the right things
to cut** if we fall behind.

## Three hard gates

| By hour | Gate | Owner | If it fails |
|---|---|---|---|
| **3** | Report inline in `/api/search`, or separate `/api/report` call? | Darryl | Yeriel builds the wrong thing and Sam's report display is rebuilt |
| **5** | The 3 planted demo ideas exist | Davin | Entire data chain slips 1:1 |
| **8** | `@xenova/transformers` proven working **on Vercel**, not just locally | Yeriel | Fall back to build-time vectors + query-side keyword/cosine hybrid. Finding this out at hour 32 is fatal |

## Cut order if we fall behind

From the team plan, in this order: **(1)** Supabase — already deferred,
**(2)** Wayback reconstruction → fall back to a screenshot, **(3)** live
`/api/report` → fall back to pre-generated reports for the planted ideas.

**Never cut the semantic match.** That's the core, and it's 30 of the 70 points.
