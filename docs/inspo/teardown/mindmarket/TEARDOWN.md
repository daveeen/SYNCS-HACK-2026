# mindmarket.com — scroll system teardown

Analyse-only run. Scope was deliberately narrowed to **how the page moves**:
scroll driver, pinning, scroll-linked backgrounds, parallax layering, reveal
timing. Their branding, palette and type were ignored on purpose — we are not
cloning a green consultancy site, we are stealing a mechanic.

Evidence tags: **CONFIRMED** = read off the live runtime or the shipped source.
**OBSERVED** = seen in the screenshot sweep. **INFERRED** = reasoned, not proven.

Artifacts: `raw/surface-map.json`, `raw/motion.json`, `raw/tokens-*.json`,
`raw/js/` (deobfuscated modules), `shots/` (18-frame sweep at 1440).

---

## 1. Stack

| Layer | What they use | Tag |
|---|---|---|
| Framework | Astro (islands, `_astro/*.js`, `<c-*>` custom elements) | CONFIRMED |
| Smooth scroll | **Locomotive Scroll v5** (Lenis-backed) | CONFIRMED |
| Tween engine | **GSAP 3.13.0**, bundled, + DrawSVGPlugin + CustomEase | CONFIRMED |
| ScrollTrigger | **not used** — `ScrollTrigger.getAll()` returns 0 | CONFIRMED |
| Character animation | **Rive** (`.riv` files on 2D canvases) | CONFIRMED |
| CSS | Tailwind v4 with custom `--*` design tokens | CONFIRMED |

The important negative: **there is no ScrollTrigger and no pinning library.**
Everything scroll-linked runs through Locomotive v5's declarative attribute API
writing a single `--progress` custom property, and plain CSS reads it. That is
much cheaper to reproduce than a GSAP timeline farm, and it degrades gracefully.

`html` carries `lenis lenis-scrolling`; Lenis options are not exposed on
`window`, so assume its defaults (lerp `0.1`, duration `1.2`). INFERRED.

---

## 2. The whole scroll system in one paragraph

Locomotive v5 tracks any element marked `data-scroll`. For each tracked element
it computes a 0→1 progress value across a configurable window and then does one
of three things, chosen by attribute:

| Attribute | Effect |
|---|---|
| `data-scroll-speed="0.1"` | classic parallax translate, speed as a fraction |
| `data-scroll-css-progress` | writes `--progress: 0…1` onto that element |
| `data-scroll-event-progress="name"` | dispatches `window` event `name` with `{detail:{progress}}` |
| `data-scroll-offset="-27%,100%"` | start,end of the progress window |
| `data-scroll-position="start, start"` | which edges the offsets are measured from |

CONFIRMED — all six attributes appear in the shipped HTML. Counts across the
homepage: `data-scroll` ×38, `-speed` ×21, `-offset` ×9, `-css-progress` ×8,
`-position` ×3, `-event-progress` ×1.

Observed `data-scroll-speed` values, all small: `0.02, 0.05, 0.07, 0.08, 0.1,
0.15` and negatives `-0.05, -0.075, -0.1, -0.15`. Nothing above `0.15`. That
restraint is the reason it reads as depth rather than as a parallax demo.

---

## 3. Mechanic A — the pinned hero that sinks (this is the one you want)

The hero is a **200svh tall block whose inner container is `position: sticky;
top: 0`**. You scroll two viewports' worth while the hero stays put, and during
that scroll a `--progress` written by Locomotive drives two things at once.

```css
/* CONFIRMED, verbatim from the shipped stylesheet */
.c-hero-home_inner.-sticky      { position: absolute; inset: 0 auto auto 0;
                                  width: 100%; height: 200svh; }
.c-hero-home_inner.-sticky .c-hero-home_container { position: sticky; top: 0; }

@media (min-width: 1000px) {
  /* darkening veil — charcoal fades in to 40% as you scroll through */
  .c-hero-home_inner::before {
    content: ""; position: absolute; inset: 0;
    background-color: var(--color-charcoal);
    opacity: calc(var(--progress, 0) * 0.4);
  }
  /* content shrinks 1 → 0.8 over the same progress */
  .c-hero-home_content {
    --scale-min: 0.8;
    transform: scale3d(
      calc(1 - ((1 - var(--scale-min)) * var(--progress))),
      calc(1 - ((1 - var(--scale-min)) * var(--progress))),
      calc(1 - ((1 - var(--scale-min)) * var(--progress))));
  }
}
```

Markup: `<div class="c-hero-home" data-scroll data-scroll-css-progress>` with
`<div class="c-hero-home_inner -sticky">` inside. Below 1000px the sticky copy
is `display:none` and a static duplicate is shown — mobile gets no pin at all.
CONFIRMED.

**Why this matters for Graveyard.** Darken + shrink under a pin is literally the
grammar of *descending*. The hero graveyard scene stays fixed, dims, and recedes
while the next section rises over it. That reads as going underground without a
single line of JS animation. It is the cheapest possible version of the effect
Darryl described, and it is the one they shipped.

---

## 4. Mechanic B — the illustrated vertical journey

Below the hero is `.c-homepage-timeline`, a single **1944.2 × 6151.5 viewBox**
SVG (aspect ratio ~1:3.16) that spans roughly 12,000px of scroll. Everything in
that section is an `<img>` absolutely positioned at a **percentage offset of the
section**, with separate desktop and mobile percentages:

```html
<img src="/timeline/soccer-shape-3.svg"
     class="absolute z-above
            max-md:top-[78.5%] max-md:right-[51%] max-md:w-[16%]
            md:top-[66.5%]     md:right-[41%]     md:w-[7%]"
     width="184" height="211" aria-hidden="true">
```

Roughly 20 such props sit at `top-[1.5%]` through `top-[87.75%]`. A subset also
carry `data-scroll data-scroll-speed="0.07"` for parallax drift. CONFIRMED.

This is the "scroll through one big illustration" pattern: **one tall artboard,
props placed in percent, a few of them drifting.** No canvas, no WebGL, no
sprite sheet. It is exactly how a tiling-dirt underground section gets built.

### The path draw

A green path is drawn along the journey as you scroll — CONFIRMED via source,
and it is the only place GSAP earns its keep:

```js
// raw/js/HT.pretty.js:519 — custom element <c-homepage-timeline>
connectedCallback() { window.addEventListener("pathProgress", this.onPathProgress); }
onPathProgress = (e) => { this.masterTimeline?.progress(e.detail.progress); };

createDesktopTimeline() {
  this.masterTimeline = gsap.timeline({ paused: true });
  this.masterTimeline.fromTo(this.$mainPath, { drawSVG: "5%" },
    { drawSVG: "100%",
      ease: CustomEase.create("custom", "M0,0 C0.952,0.017 0.744,0.69 1,1 "),
      duration: 0.9 });
  this.masterTimeline.fromTo(this.$secondaryPath, { drawSVG: "0%" },
    { drawSVG: "100%", ease: "none", duration: 1 });
  this.masterTimeline.fromTo(this.$shadowPath, { opacity: 0 },
    { opacity: 1, ease: "none", duration: 0.15 }, 0.95);
}
```

Wired declaratively:
`<c-homepage-timeline data-scroll data-scroll-event-progress="pathProgress" data-scroll-offset="-27%,100%">`

The pattern worth copying is not `drawSVG` — it is **a paused GSAP timeline
scrubbed by a single `progress()` call from a scroll event**. One event, one
number, arbitrary choreography, and it costs nothing when off-screen. Mobile
gets a separate simpler timeline (`ease: "power1.in"`) built on resize.

---

## 5. Mechanic C — the generic `--progress` interpolator

The most reusable thing on the site. One CSS class turns `--progress` into
translate/rotate/scale, with the from/to values set inline per element:

```css
/* CONFIRMED, verbatim */
.transform-element {
  --progress-start: 0; --progress-end: 1;
  --t: clamp(0, 1, (var(--progress) - var(--progress-start))
                 / (var(--progress-end) - var(--progress-start)));
  --tx-start: 0px;  --tx-end: 0px;
  --ty-start: 0px;  --ty-end: 0px;
  --rot-start: 0deg; --rot-end: 0deg;
  --scale-start: 1;  --scale-end: 1;
  --tx:    calc(var(--tx-start)    + (var(--tx-end)    - var(--tx-start))    * var(--t));
  --ty:    calc(var(--ty-start)    + (var(--ty-end)    - var(--ty-start))    * var(--t));
  --rot:   calc(var(--rot-start)   + (var(--rot-end)   - var(--rot-start))   * var(--t));
  --scale: calc(var(--scale-start) + (var(--scale-end) - var(--scale-start)) * var(--t));
  transform: translate(var(--tx)) translateY(var(--ty))
             rotate(var(--rot)) scale(var(--scale));
}
```

Used as:

```html
<img class="transform-element absolute md:top-[11%] md:left-[31%] md:w-[6%]"
     data-scroll data-scroll-css-progress
     style="--tx-start:-10px; --tx-end:10px;
            --ty-start:-10px; --ty-end:60px;
            --rot-start:…;    --rot-end:…">
```

Author scroll choreography **in the markup, per element, with no JS**. Drop this
class in as-is; it is generic and carries none of their branding.

---

## 6. Mechanic D — sticky stacking cards

Three stat cards stack under the sticky header, each offset by its index and
each rotating upright as it settles:

```css
/* CONFIRMED */
.c-numbers-stack_list_item {
  position: sticky;
  top: calc(var(--menu-bar-height) + var(--stacking-gap) - var(--spacing-fluid-lg));
  transform: translateY(calc(var(--index) * var(--spacing-fluid-xl)));
  transition: transform 0.3s;
}
.c-numbers-stack_list_item:nth-child(odd)  .c-numbers-stack_card { --rot-start: -10deg; }
.c-numbers-stack_list_item:nth-child(even) .c-numbers-stack_card { --rot-start:  10deg; }

@media (min-width: 1000px) {
  .c-numbers-stack_card { /* .transform-element rules, plus: */
    --ty-start: 20%; --ty-end: 0%;   /* rot-end is 0deg → cards straighten */
  }
}
```
```html
<div class="c-numbers-stack_list_item" style="--index: 1"
     data-scroll data-scroll-css-progress
     data-scroll-offset="0%, 40%" data-scroll-position="start, start">
```

`--stacking-gap` is `10vh` on desktop, `var(--spacing-fluid-lg)` on mobile.
Cards enter tilted ±10°, rise 20%, and land straight. The tilt alternating by
`nth-child` parity is what stops it looking mechanical.

---

## 7. Reveals — the `is-inview` convention

Locomotive adds `.is-inview` when a tracked element enters. Everything else is
plain CSS transitions with staggered `transition-delay`. No JS stagger, no
library. CONFIRMED:

```css
.c-tile-animated_bg { transform: scale(0);
  transition: transform var(--transition-duration-slow) var(--ease-bounce); }
.c-tile-animated_bg.-white { transition-delay: 0.2s; }

.c-tile-animated_title,
.c-tile-animated_description,
.c-tile-animated_cta {
  opacity: 0;
  transition: transform var(--transition-duration) var(--ease-inOut),
              opacity   var(--transition-duration) var(--ease-inOut);
}
.c-tile-animated_title       { transition-delay: 0.30s; }
.c-tile-animated_description { transition-delay: 0.35s; transform: translateY(-10px); }
.c-tile-animated_cta         { transition-delay: 0.45s; transform: translateY(-10px); }

.c-tile-animated.is-inview .c-tile-animated_bg { transform: scale(1); }
.c-tile-animated.is-inview :is(.c-tile-animated_title,
                               .c-tile-animated_description,
                               .c-tile-animated_cta) { opacity: 1; transform: translate(0); }
```

18 IntersectionObservers are registered; the reveal ones use
`rootMargin: "100% 100% 100% 100%"` (fire a full viewport early, so nothing
pops) and the section-active one uses `rootMargin: "-1px -1px -1px -1px"`.
CONFIRMED from `raw/motion.json`.

### Motion tokens (CONFIRMED)

```css
--transition-duration-fast: 0.2s;
--transition-duration:      0.4s;
--transition-duration-slow: 0.6s;
--ease-bounce:  cubic-bezier(0.17, 0.67, 0.30, 1.33);
--ease-inOut:   cubic-bezier(0.455, 0.03, 0.515, 0.955);
--ease-smooth:  cubic-bezier(0.38, 0.005, 0.215, 1);
```

`--ease-bounce` overshoots past 1 — that is the single value doing most of the
"this feels hand-made" work. Worth stealing outright.

### Bonus: the animated underline

A repeating wavy SVG mask scrolled by `@keyframes`, **paused until in view**:

```css
@keyframes wave-scroll {
  0%   { mask-position: 0px 100%; }
  100% { mask-position: var(--wave-w) 100%; }
}
:is(.underline-wave u, .underline-wave strong)::after {
  content: ""; position: absolute;
  left: .08em; right: -.05em; bottom: var(--wave-bottom-position);
  height: var(--wave-h);
  background: var(--accent-color);
  mask-image: var(--wave-svg); mask-repeat: repeat-x;
  mask-size: var(--wave-w) var(--wave-h);
  animation: wave-scroll var(--wave-speed) linear infinite;
  animation-play-state: paused;
}
:is(.underline-wave.is-inview u, .underline-wave.is-inview strong)::after {
  animation-play-state: running;
}
```

`--wave-speed: 3s`, `--wave-w` is negative (`-64px` at ≥700px, `-144px` on the
`-wave-large` variant at ≥1400px) so it travels leftward. Pausing off-screen is
a detail most builds miss.

---

## 8. GPU surfaces

`surfaceMap()` found **no WebGL and no WebGPU**. Every canvas is `CANVAS2D`
requested by **Rive** (`<c-rive data-src="/rive/hero_animation.riv">`), each with
`pointer-events: none`. 14 `.riv` files: `hero_animation, climber, shrug,
composer, trumpeter_1, trumpeter_2, gamer, scientist, binoculars, …`. CONFIRMED.

So: **no shader-extract track is needed for this reference.** Their moving
characters are an authored Rive file, not code — which is not reproducible from
the outside and is not what we want anyway.

---

## 9. Section topology (OBSERVED, 1440×900, page ≈ 13,900px tall)

| # | Section | Scroll behaviour |
|---|---|---|
| 0 | Preloader | full-screen, dismisses on load |
| 1 | `.c-hero-home` | **200svh pin**, veil to 40%, content scale → 0.8 |
| 2 | `.c-homepage-timeline_intro` | `--progress` window `0,100%` |
| 3 | `.c-homepage-timeline` | ~12,000px illustrated journey, path scrub, ~20 % -placed props, 4 `.c-tile-animated` cards |
| 4 | `.c-homepage-timeline_end` | `--progress`, clouds translate `--start`→`--end` |
| 5 | `.c-numbers-stack` | 3 sticky stacking cards |
| 6 | `.c-brands-section` | 3 marquee rails (`#rail-1..3`) |
| 7 | `.c-featured-articles` | `.c-article-card` grid |
| 8 | `.c-footer` | — |

Fixed chrome: header at `z-index: 100`, pill-shaped, always visible.

---

## 10. What to take, and what to leave

**Take (all brand-neutral mechanics):**

1. **200svh sticky hero + `--progress` veil + content scale-down.** Section 3.
   This is the graveyard-sinks-into-the-ground shot, and it is ~15 lines of CSS.
2. **One tall illustration, props at `top-[n%]`.** Section 4. Tombstones,
   skeletons and the zombie hand from the elements sheet, placed in percent over
   the tiling dirt.
3. **`.transform-element`.** Section 5. Copy verbatim. Choreograph per-element
   in markup with inline `--ty-start`/`--rot-end` etc.
4. **`data-scroll-event-progress` → paused GSAP timeline `.progress(p)`.**
   Section 4. If we want a scrubbed reveal (a grave opening, a name carving in),
   this is the wiring.
5. **`is-inview` + staggered `transition-delay`.** Section 7. No animation
   library, no stagger JS, and it is trivially killable under reduced motion.
6. **`--ease-bounce: cubic-bezier(.17,.67,.3,1.33)`.** Section 7.
7. **Parallax speeds capped at 0.15.** Restraint is the whole trick.

**Leave:**

- Rive. 14 authored `.riv` files is a design pipeline we do not have in 36h,
  and the elements sheet gives us static PNG/SVG props instead.
- Locomotive Scroll v5 itself, probably — see the risk below.
- Astro, obviously. We are on Next.js App Router.
- Everything visual: the green, the beige, the illustration style, the type.

---

## 11. Risks before anyone writes code

**Smooth scroll is a demo liability.** Lenis/Locomotive hijacks the scroll
wheel. On a projector, over a shared screen, with a judge scrolling on a
trackpad they have never used, momentum scrolling reads as lag. It also fights
`scroll-behavior`, anchor links and screen readers. Two safer options:

- Do the whole thing with **`position: sticky` + a plain IntersectionObserver +
  a small scroll listener writing `--progress`**, and no smooth-scroll library
  at all. Every mechanic above except the parallax `data-scroll-speed` works
  natively; sticky pinning is CSS, `--progress` is ~20 lines of JS.
- Or use **CSS `animation-timeline: view()`** for `--progress` where supported
  and fall back to the listener. Zero JS on modern Chrome/Edge/Safari 26.

Recommendation: **build our own 20-line `--progress` writer, skip Locomotive.**
We get sections 3, 5, 6 and 7 exactly, we lose only the momentum feel, and we
remove a scroll-hijack risk from the live demo.

**The scroll length must be paid for.** Their journey is ~12,000px because they
have twenty illustrated props to reveal. A graveyard section with four
tombstones does not earn 12,000px of scroll, and a judge will scroll past an
empty dirt field. Budget the height against the number of reveals, not against
how good the dirt texture looks.

**`svh` not `vh`.** They use `200svh` and `50svh` throughout — CONFIRMED. On
mobile Safari `vh` jumps when the URL bar hides and the pin visibly stutters.

**Reduced motion is unhandled here.** `motion.json` shows no
`prefers-reduced-motion` block anywhere on mindmarket.com. We must add one —
`docs/inspo/README.md` already makes it non-optional, and it is part of the
Design score. Under reduced motion: keep sticky, drop parallax and scrubs, show
reveals at their end state immediately.

---

## 12. Where this collides with our own design rules

Flagging rather than deciding, since `CLAUDE.md` makes Darryl the tie-breaker
and Sam the owner of the visual system.

The elements sheet in `docs/inspo/landingpage/` is **purple (`#6E4CFF`) on near-
black (`#1B1B23`), with a skull emoji in the logo and a `💀` in the death-cause
line**. Against the anti-slop list in `CLAUDE.md` that is item 20 (purple and
black), item 7 (emojis), and arguably item 29 (`#6E4CFF` and `#8BC34A` are close
to neon). Creepster as a display face is also a well-worn Halloween default.

None of that is a blocker and none of it is my call — but the list exists
because judges have seen forty purple-and-black AI sites this weekend, and a
graveyard theme is where a build is *most* likely to land on the default. The
mechanics in this document are the part that will not look generated. Worth
five minutes with Sam on the palette before the props get placed, because the
prop art and the palette are the same decision.

Separately, the sheet's copy uses `didn't` and a `💀`, and the mock has an
em dash in "Media / Entertainment". Item 9 bans em dashes in UI copy.

---

## Key takeaways

- No ScrollTrigger, no WebGL. The entire site moves on **one `--progress`
  custom property** written by Locomotive v5 and read by ordinary CSS `calc()`.
- The hero "descent" is **`height: 200svh` + an inner `position: sticky; top: 0`**,
  with an overlay at `opacity: calc(var(--progress) * .4)` and content at
  `scale: 1 → 0.8`. That is the graveyard-sinking shot, in CSS.
- The long scroll is **one tall SVG artboard with props at `top-[n%]`**, a
  handful drifting at `data-scroll-speed` ≤ 0.15. Directly transferable to a
  tiling dirt column with tombstones and skeletons.
- `.transform-element` is a **generic markup-authored scroll interpolator** —
  copy it verbatim, it is brand-neutral.
- Reveals are `is-inview` + `transition-delay`. `--ease-bounce:
  cubic-bezier(.17,.67,.3,1.33)` is the signature.
- **Do not ship the smooth-scroll library.** Write the 20-line `--progress`
  writer ourselves; scroll hijack is a live-demo risk and Lenis buys us nothing
  the mechanics need.
