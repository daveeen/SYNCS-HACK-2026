# Design inspiration

Owners: **Sam** + **Darryl**.

Drop reference screenshots in this folder. This is where Claude looks when you
say "build it like the inspo."

## How to add one

1. **Screenshot it** (not a link — a link tells me the HTML, a screenshot tells
   me what it *looks* like). PNG or JPG, whole section not whole page.
2. **Name it `<what>-<where>.png`** — what element, which site it came from:
   - `hero-layout-linear.png`
   - `card-hover-vercel.png`
   - `results-list-perplexity.png`
   - `type-scale-stripe.png`
3. **Add a line to the table below** saying *what specifically* you want from it.

## The important bit: say what you want from it

A screenshot on its own is ambiguous. "Make it like this" makes me guess, and I
will guess wrong — usually by copying the whole look when you only wanted the
spacing.

| Bad | Good |
|---|---|
| "make it look like this" | "the way the cards stagger in on scroll" |
| "I like this site" | "this type scale — big display, tiny mono labels" |
| "steal the hero" | "the two-column split, not the colours" |

Name the **one or two things**. Everything else I'll leave alone.

## If the thing you want is an animation

**Claude cannot watch video.** A `.mov` / `.mp4` / `.gif` in this folder is
invisible to it — it sees a filename and nothing else. Do one of these instead:

**Frames.** Screenshot the motion at 3-4 points and number them in order:
`scroll-reveal-linear-1.png`, `-2.png`, `-3.png`. Before trigger, mid, settled.

**Describe it.** Five fields pin down almost any animation:

| Field | Example |
|---|---|
| Trigger | enters viewport at 2/3 height · scroll-scrubbed · sticky pin |
| What moves | the tombstone cards — opacity + translateY |
| From → to | opacity 0, y +30px → opacity 1, y 0 |
| Timing | 500ms, ease-out, 80ms stagger between cards |
| Reverses? | no — fires once and stays |

**The URL + devtools.** Paste the link (Claude can read the page's HTML and
often identify the library). Better: right-click the element → Styles panel →
copy the `transition` or `@keyframes` rule.

### Two constraints before you fall in love with a scroll effect

- **`prefers-reduced-motion` is not optional.** Every animation needs a
  no-motion fallback. Accessibility is part of the Design score.
- **Scroll animation on the RESULTS page is a demo risk.** The pitch is 90
  seconds with a judge watching a live search. If matches only appear once
  someone scrolls, that costs demo time and reads as broken on a projector.
  Landing page: animate freely. Results page: content should be there on arrival.

## References

| File | What we want from it | Where it applies |
|---|---|---|
| `landingpage/ChatGPT Image ... 10_34_25 PM.png` | The **element inventory only** — tombstones 1-3, skeleton 1-2, zombie hand, dead tree, fence, rocks, fog. Props to place in the hero scene. Palette and type on that sheet are still open (see teardown §12). | Landing hero |
| `landingpage/ChatGPT Image ... 10_38_32 PM.png` | Seamless dirt texture. Tiles vertically as the background of everything below the hero. | Landing, below fold |
| `teardown/mindmarket/TEARDOWN.md` | The **scroll system**, not the look: 200svh sticky hero that darkens and shrinks, one tall artboard with props at `top-[n%]`, and the `--progress` CSS interpolator. | Landing scroll |

## One caution

Borrowing structure and interaction patterns is normal design practice.
Reproducing a recognisable site's whole visual identity is a different thing —
judges scoring Design (15 pts) may well recognise it, and "that's just Linear"
is a bad note to get. Combine two or three references and let the graveyard
subject drive the rest.
