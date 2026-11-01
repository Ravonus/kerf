# warp 08 — Marketing, commerce, media and the expressive governor

Status: v0.3, 2026-10-28 (market gaps closed: §4.2 reviews, §5.2 selection, §5.3 players + `timeline()`, §3.6 wall, §3.12 section set, §6.2–§6.6 backgrounds, text effects, scroll-driven, `fancy` presets, MotionCard; a second specimen page). v0.2: review round (01, 02, 03 findings fixed; §3.13, §3.14, §4.1, §6.1 new). Owner: brand and motion (`market` in [COVERAGE.md](COVERAGE.md)). Reads: [SIGNATURE.md](SIGNATURE.md),
[00-direction.md](00-direction.md), [01-foundations.md](01-foundations.md). CSS: [tokens/warp-marketing.css](tokens/warp-marketing.css)
(`@layer warp.marketing`). Specimens: [specimens/marketing.html](specimens/marketing.html), one landing page that flips between
quiet, balanced and vivid live, with phone, tablet and desktop frames, and [specimens/marketing-more.html](specimens/marketing-more.html)
(media, presets, backgrounds, text and scroll effects, the wall and the section set) on the same shared files. Citations: `old:` = the predecessor's
`packages/ui/src/` (read-only).

Reused by name, never re-drawn: **Button** (solid, soft, outline, ghost, frame), **Toggle / ToggleGroup** with its
sliding `indicator`, **Chip**, **Badge**, **StatusDot**, **Surface**, **Accordion**, **Sheet**, **Dialog**, **Toast**, **Steps**
(`05`, `warp-components.css`); **Field** with the floating label and sweep (`warp.css` signature); **Frame** ratios (`02`).

---

## 0. Decisions

1. **One markup, three readings.** Every block here renders the same DOM at every stop. Quiet reads as a sober B2B page
   (Inter, slate, soft shadows, nothing moving on its own); vivid reads as an award-site page (Instrument Serif at up to
   2× display, aurora, grain, a giant word band, square corners, ink offsets). Nothing in a component API mentions style.
2. **Effects are governed, not sprinkled.** Each expressive effect is a registered *effect* with a minimum stop, a
   substitute, a reduced-motion substitute, a performance class and a pause rule (§1). The governor writes one
   attribute per host, `data-fx-state="on | still | off"`, and CSS keys only on it. That is how "push the limits"
   stays professional: the limits are written down.
3. **The sweep stays the signature.** Controls (outline buttons, chips, the announcement pill, the newsletter field)
   use the real two-border sweep at every stop. Interactive *surfaces* (bento tiles, plan cards, the lobby card,
   template listings) follow the SIGNATURE surfaces exception: they rest on the hairline (`sweep-base` =
   `color.border`, transparent host border) and only sweep at vivid (`--_on: var(--warp-sweep-surfaces)`); below vivid
   hover and focus raise the base to `border-strong` and lift to `elevation-2`. The *decorative* uses (a heading rule
   that draws once, the border beam) are governed effects and never run beside a live sweep. The sweep colour is
   `--warp-color-sweep`; `--_on` is always a number (a button's on-solid ink is `--_ink-on`).
5. **Motion defaults to the OS.** The page never writes `data-motion` unless the reader picks Full or Reduced, so
   `prefers-reduced-motion: reduce` is honoured with no setup, and under it nothing moves beyond a fade (02 B3, 03 B5).
   Loops carry `data-loop`, so the base layer stops them even where the governor has not run yet.
4. **Native first.** Carousel slide mode is CSS scroll-snap (native swipe, momentum, RTL). Parallax and the story rail
   are CSS scroll timelines (off the main thread). Overlays are `<dialog>`. The compare slider is an `<input type=range>`.
   Script only where the platform has nothing: pinch-zoom, scramble, typewriter, count-up, confetti.

## 1. The governor

### 1.1 Tokens

| Token | quiet | balanced | vivid | Meaning |
|---|---|---|---|---|
| `--warp-fx-level` | 0 | 1 | 2 | the stop as an integer; an effect's `min` is compared to it |
| `--warp-fx-k` | 0.2 | 0.55 | 1 | continuous intensity: glow alpha, parallax depth, price-swap travel |
| `--warp-mk-hero-k` | 1 | 1.22 | 2 | hero display multiplier, capped by `11cqi` (vivid and editorial `15cqi`) |
| `--warp-mk-title-k` | 1 | 1.1 | 1.55 | section title multiplier |
| `--warp-mk-art-1…3` | | | | aurora / poster pastels (light) or deep glows (dark): accent hue, +62°, −74° |
| `--warp-mk-ink-1…3` | | | | gradient-text stops; L ≤ 0.5 light, ≥ 0.8 dark, so each clears 4.5:1 on page and surface |
| `--warp-text-emphasis-style` | upright, accent ink | upright, accent ink | the serif's real italic | the headline `<em>` (01 §14); the landing sets `font-synthesis-style: none`, so no stop ever shows a faux slant |
| `--warp-fx-cap` | `data-fx-cap="quiet / balanced"` | | | caps effects only; type and shape keep their stop |

All are inherited and nest like every warp input: a `data-expression="quiet"` pricing section inside a vivid page gets
quiet effects. `--warp-motion-scale` = 0 (reduced motion) is read alongside.

### 1.2 The effect contract

```ts
type Stop = "quiet" | "balanced" | "vivid";
type FxState = "on" | "still" | "off";           // moves · present but static · absent / substituted
type FxClass = "C" | "P" | "S";                   // §1.4
interface EffectSpec {
  name: string;
  min: Stop;                    // below this the effect is "off" and its substitute renders
  moves?: Stop;                 // from min up to (not incl.) this stop it is "still"; default = min
  reduced: "still" | "off";     // what prefers-reduced-motion or data-motion="reduce" gets
  class: FxClass; budget: { ms?: number; count?: number; loops?: boolean };
  pointer?: "fine";             // pointer-driven effects go still/off on coarse pointers
}
```

**Resolution, per host, in order:** level = min(`--warp-fx-level`, `--warp-fx-cap`) → below `min`: `off` → reduced
motion: `reduced` → needs a fine pointer and doesn't have one: `off` (spotlight: `still` at vivid) → below `moves`:
`still` → `on`. Re-run on dial, theme-island, motion, pointer or cap change. O(hosts), one attribute write each, and
only when the value changes. A host also gets `data-seen` once (IntersectionObserver) for one-shot effects and
`data-fx-offscreen` while out of view (loops pause). The page-level `data-fx-paused` pauses every animation in
`on` hosts and every scripted loop.

### 1.3 Registry (the shipped effects)

| Effect | Min | quiet | balanced | vivid | Reduced | Class · budget |
|---|---|---|---|---|---|---|
| `reveal` (ScrollReveal, AnimatedGrid) | quiet | fade only | fade + 16px rise, stagger 32ms | fade + 24px rise, stagger 48ms | fade, 60% time | C · once, ≤ 6 staggered |
| `rule` (decorative sweep) | quiet | static line | draws L→R once on view | same, emphasis 2px | static | P · 1 run, ≤ 1.2s |
| `gradient-text` | balanced | accent ink | static gradient | gradient + one shimmer | static gradient | P · once ≤ 1.2s |
| `scramble` | balanced | plain text | once on view, 650ms | once on view + on hover, 900ms | plain | S · ≤ 2ms/frame |
| `typewriter` | balanced | full text | types phrase 1 once, caret then hides | loops type → hold → erase | full text | S · loops pausable |
| `countup` | balanced | final value | 900ms ease-out | 1400ms | final value | S · once |
| `marquee` (logos) | balanced | static cloud | 40px/s | 40px/s | static cloud | C · loop, paused off-screen |
| `band` (word marquee) | vivid | hidden | hidden | 70px/s giant serif | hidden | C · loop |
| `spotlight` | balanced | none | glow 0.7α, fine pointer | glow 1α; static corner glow on touch | static glow | C · rAF-batched translate |
| `beam` (border beam) | vivid | none | none | one lap on view and hover | none | C · rotate once, 1.8s |
| `parallax` | balanced | static | ±20px | ±36px+ | static | C · scroll timeline |
| `tilt` / `magnetic` | vivid | flat | flat | ≤ 7° / ≤ 6px, fine pointer | flat | C |
| `aurora` | vivid | none | static glow only | 3 blobs drift 26–37s | static blobs | C · loop, off-screen paused |
| `story` (scroll story) | balanced | 3 columns | sticky + scroll rail | + display steps | sticky, rail by step | C · scroll timeline |
| `carousel` autoplay | balanced | manual | opt-in rotation | auto-starts, 6s | manual | C · progress hairline |
| `facts` rotation | balanced | manual | 7s | 7s | manual | C |
| `confetti` | balanced | check + toast | 70 bits | 160 bits | check + toast | S · once ≤ 1.8s, DPR ≤ 2 |
| `scene` (ParallaxScene, §3.13) | balanced | flat, layers aligned | 4 layers on one view timeline | + pointer depth, fine pointer | off (flat) | C · scroll timeline |
| `theme-wipe` (§6.1) | balanced | instant | View Transition crossfade | woven L→R wipe 560ms (420ms touch / < 768px) | instant | C · once per change |
| `autotrack` (live room, §3.14) | quiet | still snapshot | cursors glide, outlines fade | same | outlines fade in place, no travel | C · loop, own pause, off-screen paused |
| `list` (animated results, §4.1) | balanced | instant | fade + 2 × `motion-distance` rise, ≤ 6 staggered | same | fade only | C · once per filter |
| `fancy` presets (§6.5) | quiet | plain enter / exit | plain enter / exit | the preset, ≤ 400ms | fade (plain, distance 0) | C · once per trigger; flicker ignores repeats < 1s |
| `motion-card` (§6.6) | quiet | flat (shadow, colour) | shadow lift, press 0.98 | + rise 2px, scale 1.01 on hover | flat | C · transform only, never layout |
| `retro` grid (§6.2) | quiet | static plane | static plane | lines travel, 1.6s | static plane | C · loop, off-screen paused |
| `rays` (§6.2) | vivid | none | none | 7 beams sway, 8–12s | static beams | C · loop, ≤ 8 nodes, off-screen paused |
| `shiny` (§6.3) | balanced | plain ink | sheen once on view, 1.1s | + again on hover | static sheen | P · once |
| `highlight` (§6.3) | quiet | static mark | draws L→R on view | same, marker style | static mark | C · once (`scaleX`) |
| `rotate` / `morph` (§6.3) | balanced / vivid | first word | words swap every 2.5s (rotate) | + per-glyph morph | first word | S · one shared ticker, own pause, stops off-screen |
| `text-reveal` (§6.3) | balanced | full ink | word ink on a view timeline | same, lower floor | full ink | C · `view()`; JS fallback |
| `progress` bar (§6.4) | quiet | `scroll(root)` bar | same | same | same (user-driven) | C · `scroll()`; JS fallback |
| `container-scroll` (§6.4) | balanced | flat device | tilt 16° → flat | tilt 22° → flat | flat | C · `view()`; JS fallback |
| `velocity` text (§6.4) | balanced | two centred lines | rows drift with scroll | + skew ≤ 6° from scroll speed, decays | two centred lines | C · `view()`; the skew rAF runs only while it decays |
| `wall` marquee (§3.6) | quiet | masonry | columns drift 44–52s | same | masonry | C · loop, own pause, hover/focus hold |

The catalogue in §6 adds the P2 effects with the same columns.

### 1.4 Performance classes

- **C, compositor.** Animates only `transform`, `opacity`, `translate`, `scale`, `rotate`. May loop *only* if it pauses
  off-screen, under reduced motion, under the page pause, and on hover/focus when it carries content (marquee).
  Blur is static on the layer (aurora): the GPU moves a cached texture.
- **P, paint.** Animates `background-position`, `clip-path` or a gradient on a small box (≤ one heading), **once**,
  ≤ 1.2s. Never loops.
- **S, script.** rAF work ≤ 2ms per frame, one-shot or pausable, and it **never reflows its line**: text effects render
  into a `live` span over a hidden `ghost` that holds the final (or longest) string, with `contain: layout paint`;
  the real text sits in a visually hidden `sr` span. Canvas effects are `position: fixed`, `pointer-events: none`,
  removed when done.
- **Banned in every class:** animating `width`, `height`, `top/left`, `margin`, `font-size`, `box-shadow` or `filter`
  per frame; scroll listeners that write layout; more than one `S` loop on screen; `will-change` on idle elements.
- **Budget per viewport:** ≤ 2 looping effects visible at once, ≤ 1 "hero" effect (aurora, band, coverflow), and the
  sweep never runs beside a beam on the same surface.

### 1.5 Composition and pause rules (WCAG 2.2.2, 2.3.3)

- Anything that moves for more than 5s on its own (marquee, band, aurora, typewriter loop, carousel autoplay, fact
  rotation, the live room) has **its own visible pause** where it carries content, and the page has **one global
  "Pause motion" control** in the top bar, shown only while something is moving (`data-fx-moving`). The logo
  marquee's pause is a real button in the caption row ("Pause logos" / "Play logos", `aria-controls` the marquee),
  outside the edge-fade mask, shown whenever the marquee is `on`; hover and focus still hold it too. The room has
  "Pause peers"; the fact carousel has its rotation button.
- **Reduced motion** (OS setting or `data-motion="reduce"`): every effect resolves to its `reduced` column, every
  remaining transition is opacity only (hover scales, caption rises, reveal rises, story frame scale are multiplied by
  `--warp-motion-scale`), smooth scrolling is off, and the theme change is instant.
- Nothing flashes more than 3 times a second; confetti has no strobe and fades over its last 35%.
- Parallax depth, tilt and coverflow count as vestibular triggers: they are `off` under reduced motion, not slowed.
- Substitutes keep meaning. The confetti substitute is a check and a toast that say the same thing, and the toast is
  shown at every stop because the success needs words anyway.

### 1.6 API

```ts
import { defineEffect, fx, Effects } from "@weft/warp/expressive";
// any element: <h1><em use:fx="gradient-text">trust</em></h1>; fx() returns the live state for custom work
const state: State<FxState> = fx(el, "spotlight");
defineEffect({ name: "rain", min: "vivid", reduced: "off", class: "S", budget: { ms: 1600, count: 120 } });
// weft.config.ts → ui.theme.fx: { cap?: Stop; pauseControl?: "auto" | "always" | "none"; effects?: Record<string, Partial<EffectSpec> | false> }
```

`<Effects cap="balanced">` is just `data-fx-cap` on a wrapper. Agents get one rule (`weft check` D-code `D081`): an
element with an animation that is not a registered effect, or a `data-fx` host without a substitute, fails the check.

## 2. Shared section shell

- **Block** (`data-scope="block"`): `container: block`, padding `section × 1.5` (vivid × 2.25) and `page` gutters, an
  `inner` capped at 1200px. `data-tone-bg="sunken | inverse"`, `data-divider`.
- **Head**: `eyebrow` (vivid adds an `(02)` mono index), `title` (title font × `mk-title-k`, `text-wrap: balance`, capped
  at `9.5cqi`), `lede` (prose, 62ch), optional `rule`. `data-align="center"`. At vivid the one `<em>` in a headline
  takes `--warp-text-emphasis-style` (01 §14): upright accent ink at quiet and balanced, the serif's real italic at
  vivid. Never a whole quote or paragraph in italic.
- **Responsive**: every block answers its own container at 600 / 760 / 860 / 1000px, never the window. Phone stacks,
  tablet goes 2-up, desktop goes to the full grid. Type steps come from `data-form` (01 §7).
- **Reveal**: `data-reveal` and `--_d` for stagger (§1.3). Never on the first viewport's content (LCP).

```ts
type BlockProps = { tone?: "page" | "sunken" | "inverse"; divider?: boolean; eyebrow?: Child; index?: string;
  title: Child; lede?: Child; align?: "start" | "center"; rule?: boolean; children: Child };
```

## 3. Marketing blocks

Each block lists **anatomy**, **states**, **phone / tablet / desktop**, **motion by stop** (q / b / v), **a11y**, **API**.

### 3.1 Hero (`old:marketing/hero-cta/Hero.tsx`)
- **Anatomy:** `backdrop` (`aurora`, `weave`, `glow`, `grain`), `copy` (`announce` pill, `eyebrow`, `title`, `lede`,
  `actions`, `proof`), `media` (product `mock`, image, video or device frame) with optional float chips.
- **Layouts** (`layout`): `split` (copy | media ≥ 900px; vivid weights copy 1.25 : 0.85), `centered` (media below,
  980px), `stacked` (headline row, then lede beside actions), `editorial` (12-col; headline spans, lede and actions
  start at col 7, media bleeds from col 2). The old `variant: plain | surface | accent` becomes `tone` on the block.
- **Phone:** one column, media after actions, float chips tuck in, title capped by `cqi` so "Ship agent work" never
  breaks mid-word; actions wrap to two rows of full 44px targets. **Tablet:** split collapses to stacked under 900px.
- **Motion:** q — nothing moves; weave and glow hidden; em in accent ink. b — weave lines and a static accent glow;
  eyebrow scrambles once; terminal types once; media parallax ±20px. v — aurora, grain, 2× serif display with
  gradient italic word, ink-offset mock, tilt and magnetic primary CTA on fine pointers, terminal loops.
- **A11y:** one `h1`; the mock is `role="img"` with a sentence label; scramble and typewriter expose real text via
  `sr`; aurora and weave are `aria-hidden`. No autoplaying video without a visible pause.

```ts
type HeroProps = { layout?: "split" | "centered" | "stacked" | "editorial"; tone?: "page" | "sunken" | "accent";
  announce?: { label: Child; href: string; badge?: Child }; eyebrow?: Child; title: Child; lede?: Child;
  actions?: Child; proof?: Child; media?: Child; backdrop?: ("weave" | "glow" | "aurora" | "grain")[] | "auto" };
```

### 3.2 Logo cloud and marquee (`LogoCloud`)
- **Anatomy:** `caption`, `marquee` › `track` (list of `logo`) + an `aria-hidden` duplicate track, `pause`.
- **States:** running, hover/focus-held, paused (button `aria-pressed`), still (wraps into a centred cloud, duplicate
  hidden). Speed is px/s (default 40), so long and short lists move at the same pace. `reverse`, `vertical`.
- **Responsive:** gap `clamp(28px, 6cqi, 72px)`; edge fade mask; on phone the still cloud wraps to 2–3 rows.
- **Motion:** q still · b runs · v runs, logos in serif italic. The vivid **word band** is a second marquee
  (`variant="band"`, min vivid) used once per page between sections.
- **A11y:** the real list is one `ul`; the clone is `aria-hidden` with links `tabindex=-1`. The pause button sits in
  the caption row *before* the marquee (visible, 2.2.2), toggles `data-paused`, and swaps its label; the track carries
  `data-loop`.

```ts
type MarqueeProps = { items: Child[]; speed?: number; direction?: "left" | "right" | "up" | "down";
  variant?: "logos" | "band" | "cards"; pauseOnHover?: boolean /* default true */; label: string };
```
Testimonial and card marquees use `variant="cards"` (min balanced, still = a 3-up grid).

### 3.3 Stats band (+ CountUp, `old:display/metrics/CountUp.tsx`)
- 2-up on phone, 4-up ≥ 760px, joined by 1px gaps (one border, no box-in-box). Vivid drops the boxes for hairline
  rules and 2.1× numerals. Values use `--warp-text-numeric-variant`; ticking figures (the lobby countdown) also take
  `--warp-text-numeric-font`, since vivid's serif has no `tnum`. Count-up per §1.3; the final string is in the DOM from the start.
```ts
type StatsBandProps = { items: { value: number; format?: Intl.NumberFormatOptions; suffix?: string; label: Child }[]; countUp?: boolean };
```

### 3.4 Feature grid and bento (`FeatureGrid`)
- **Feature grid:** `icon` (36px soft tile), `name` (heading; vivid serif ×1.45), `body`; 1 / 2 / 3 columns.
- **Bento:** the same `tile` with `span="1x1 | 2x1 | 2x2"` and an optional `art` slot. 1 col phone, 2 col tablet (2x2
  spans 2 cols, 1 row), 4 col ≥ 1000px. Author spans to fill 12 cells exactly; the specimen uses 2x2 + 1 + 1 + 2x1 +
  1 + 1 + 2x1.
- **States:** interactive tiles sweep (signature) and lift no further than `elevation-2`; spotlight per §1.3.
- **A11y:** a linked tile is one `<a>` with a heading inside; no nested interactive content.
```ts
type BentoProps = { items: { icon?: Icon; name: Child; body?: Child; art?: Child; span?: "1x1" | "2x1" | "2x2"; href?: string }[]; spotlight?: boolean };
```

### 3.5 Scroll story (sticky scroll reveal)
- **Anatomy:** sticky `visual` › `screen` › `frame` per step; `steps` with a `rail` that fills by scroll.
- **Desktop ≥ 860px:** visual sticks at 96px; each step is `min(58vh, 520px)`; the active step (IntersectionObserver at
  the middle band) is full ink, others 35%. The rail uses `view-timeline: --story`; without scroll timelines the rail
  fills by step. **Phone/tablet:** steps stack with numbers, no sticking (no scroll-jacking on touch).
- **Motion:** q — three columns, no sticky. b — sticky, crossfade between frames. v — display-serif step titles.
```ts
type ScrollStoryProps = { steps: { title: Child; body: Child; visual: Child }[]; rail?: boolean };
```

### 3.6 Testimonials (`TestimonialCard`): card, wall, carousel
- **Card:** `blockquote`, `figcaption` (avatar, name, role), optional `stars` and source logo. Vivid sets the quote
  in serif at 1.35× heading.
- **Wall** (demo `#wall`): CSS columns 1 / 2 / 3 by container width (masonry without JS), collapsed to 680px with a
  bottom mask and a "Show all" disclosure (`aria-expanded`, `aria-controls` the viewport). A quote may carry a
  `source` (G2, X, Slack…) in mono caps. `variant="marquee"` turns the columns into `tracks` (one `col` per column,
  `--_cols` from the container width) that drift upward, alternate columns reversed, 44–52s per lap, only when the
  `wall` effect is `on` (balanced+). Hover and focus hold it, it has its own "Pause wall" button and obeys the page
  pause, and it stops off-screen. Each column renders its quotes twice for a seamless loop: the first copy is the
  readable list, the second is `aria-hidden` and `inert`. Quiet and reduced motion show the masonry. Anatomy:
  `wall > viewport > columns (ul > li > quote) + tracks > col > ul ×2`, `foot > more`.
- **Carousel:** §5.1 with `per="auto"` (1 + peek on phone, 2 on tablet, 3 on desktop).

### 3.7 Pricing: cards, billing toggle, comparison table (`PricingCard`)
- **Toggle:** ToggleGroup as `radiogroup` with the sliding `indicator` (roving tabindex, arrows). A "Save 20%" Badge
  beside it. The change is announced once in a polite live region.
- **Plan card:** `name` (+ badge), `desc`, `price` (`amount` + `per`), `features` (check or excluded ×, excluded in
  faint ink with real text), `cta`. Featured: 1px accent border + emphasis ring; vivid inverts it and adds the `beam`.
  Plans: 1-up phone, featured first full-width on tablet, 3-up ≥ 860px.
- **Price swap:** old value leaves up, new rises in (`mk-out` / `mk-in`), travel × `fx-k`; quiet is a crossfade,
  reduced is instant. Width is held by the grid cell, so the card never reflows.
- **Comparison table:** a real `<table>` with `caption`, row groups (`scope="rowgroup"`), sticky header row and sticky
  first column, featured column tinted, ✓/— with `sr` text "Yes/No"; horizontally scrollable region with
  `tabindex=0` on phone.
```ts
type PricingProps = { periods?: { id: string; label: Child; note?: Child }[]; period?: Bindable<string>;
  plans: { id: string; name: Child; desc?: Child; price: Record<string, string> | Child; per?: Child;
    features: { text: Child; excluded?: boolean }[]; cta: Child; featured?: boolean; badge?: Child }[];
  compare?: { groups: { label: string; rows: { label: Child; values: (Child | boolean)[] }[] }[] } };
```

### 3.8 FAQ (`FAQ`)
Accordion (comp) in a 0.8 : 1.2 grid beside a head ≥ 900px; stacked below. Multiple open allowed; `h3` triggers;
deep-link `#faq-3` opens and scrolls. Emits `FAQPage` JSON-LD when `structuredData` is set.

### 3.9 CTA band and newsletter (`CTA`, `NewsletterForm`)
- **CTA:** inverse surface (quiet: accent-soft) with weave at the trailing edge, title capped at `10cqi`, ≤ 2 actions;
  the primary inverts to `on-inverse` fill. Side-by-side ≥ 860px.
- **Newsletter:** the signature Field (floating label, sweep, per-letter tint) + Button, stacked under 420px. States:
  idle, invalid (sweep pinned critical, message slides in), submitting (button `data-loading`), success (toast and
  inline text), already-subscribed. Fine print for consent sits under the field.
```ts
type NewsletterProps = { action: (email: string) => Promise<"ok" | "exists">; label?: string; fine?: Child };
```

### 3.10 Footer (`Footer`)
Brand + newsletter column and 3–4 link columns (5-col ≥ 860px, brand row + 3 cols on tablet, stacked on phone with
44px link rows), then a base row (legal, locale, theme switcher). Vivid adds a giant `wordmark` row (26cqi serif, one
italic syllable), `aria-hidden`.

### 3.11 Session lobby and fact carousel (`SessionLobby`, `old:feedback/loading/FactCarousel.tsx`)
- **Lobby:** `phase` chip (`before | ready | live | ended` with StatusDot caution / positive / critical-live /
  neutral), title, `countdown` (`role="timer"`, a minute-level `aria-label`, digits only swap, no animation),
  actions (remind, share, join when `ready`), `aside` slot. The card sweeps. Two columns ≥ 860px.
- **Fact carousel:** a stacked carousel of short facts, 7s rotation at balanced+, own pause, prev/next, hover and
  focus hold, `aria-live="off"` while rotating. Phases swap with the lobby: `live` replaces the countdown with Join.
```ts
type SessionLobbyProps = { phase: "before" | "ready" | "live" | "ended"; startsAt?: string; title: Child; feature?: Child;
  aside?: Child; primaryAction?: Child; stageLabels?: Partial<Record<SessionLobbyProps["phase"], string>> };
type FactCarouselProps = { items: { id: string; eyebrow?: Child; title: Child; body: Child }[]; intervalMs?: number; controls?: boolean };
```

### 3.12 The standard section set
All use Block + Head and only tokens; each has a quiet and vivid reading and no new motion.
- **Team** (demo `#team`): `ul[data-scope=team] > li[data-scope=person]`: `photo` (4:5, two images: `color` carrying
  the alt text, and `mono`, `aria-hidden`), `name` (h3), `role`, `links`; 2 / 3 / 4 columns by container. Vivid shows
  the grey copy and fades the colour copy in on hover or focus within (C: `opacity` of a layer, not `filter`); the
  other stops show colour.
- **Changelog** (demo `#changelog`): `ol[data-scope=changelog] > li[data-part=release]`: `knot`, `when` (`time` in
  mono + version Badge), `what` (h3, prose, `items` with New / Improved / Fixed badges, optional `media` figure). A
  Timeline (`06`) rail; from 860px the date column is sticky at `--warp-mk-sticky-offset` beside each release.
- **Blog index** (demo `#blog`): `ul[data-scope=blog]`: a `post[data-featured]` spanning the row (2:1 art beside the
  body from 760px), then cards (`art` 3:2, `tag` eyebrow, `title` whose link is the whole-card overlay, `excerpt`,
  `meta` with avatar, author, date and read time). The surface sweep runs on posts at vivid. `blog-foot` holds the
  Pagination from `05` (summary "Page n of N" under 420px); a page change moves focus to the first post's link.
- **Article with TOC:** prose at 68ch (`text.prose`); TOC as AnchorNav (`02`) sticky on the right ≥ 1000px, a
  disclosure "On this page" above the article below that; current heading tracked by IntersectionObserver; a 1px
  reading-progress bar driven by `animation-timeline: scroll()` (C, balanced+).
- **Contact** (demo `#contact`): `contact > aside (head, dl channels) + form (a row of two Fields, a select Field,
  the multi-line Field, a consent Checkbox inside its label, submit)`. Validation runs on submit only: each failing
  Field gets `data-invalid`, `aria-invalid` and its `message`, and focus goes to the first. Success swaps the form for
  `done` (`role=status`, focused) with "Send another".
- **Waitlist** (demo `#waitlist`): a surface with a static `bg` (the dots backdrop, §6.2), title, one email Field and
  Button, and `proof` (avatars + count). After submit the form is replaced by `place` (`role=status`, focused): the
  number in the display numeric face, then `share` (the link in a `code` + Copy). No count-up: the number is the news,
  so it appears at once at every stop (this replaces v0.2's count-up).
- **404 / 500:** the empty-state pattern from `00` §7 (a broken weft thread), display-size "404" in the title font,
  search field, three links. Vivid sets "404" in 2× serif with the broken thread drawn by the `rule` effect.
- **Device mockups:** `Device kind="browser | phone | tablet | laptop"` frames (1px border-strong, radius 10 / 34 / 22,
  safe-area notch optional) around any child; used by the hero and by the specimen's own frames.

### 3.13 ParallaxScene (`old:parallax`: ParallaxScene + ParallaxLayer)
- **Anatomy:** `scene` (`view-timeline: --scene block`, 16 : 5.6, 4 : 3 under a 640px container) › `layer` ×n, each
  with `speed` 0…1 (0 = locked to the page, 1 = locked to the viewport). The specimen's four layers (0, .35, .65, .9)
  are agents, traces, gates and production; each draws a segment of one weft `thread` with a `knot`, and the segments
  line up into one straight thread when the scene is centred in the viewport. That is the meaning, so the flat
  fallback shows the aligned state.
- **Motion:** each layer translates `depth × (1 − speed)` over `animation-range: cover` on the scene's view timeline
  (C, off the main thread); depth = 150px × `fx-k`. Without scroll timelines a single rAF-batched IntersectionObserver
  writes `--_p` (0…1). At vivid with a fine pointer, `data-pointer-depth` adds up to ±14px × speed (±10px vertical) from the pointer
  (`pointerFx`), as `translate` only.
- **Stops:** q — off: flat, aligned, captions stacked. b — scroll depth. v — scroll depth + pointer depth.
  **Reduced:** off (vestibular), so the aligned still.
- **Responsive:** below 640px the decorative cards hide and the captions stack under the thread; touch never gets
  pointer depth. **A11y:** the scene is `role="img"` with a sentence label; layers are `aria-hidden`.
```ts
type ParallaxSceneProps = { label: string; ratio?: number; depth?: number; pointer?: boolean | "auto"; children: Child };
type ParallaxLayerProps = { speed: number; children: Child };
```

### 3.14 Live room (`old:multiplayer`: MultiplayerAutoTrack, LiveCursorsOverlay)
The marketing showcase of `app`'s presence pattern: peers' cursors and focus outlines over a real UI, with nothing
wired by hand.
- **Tracking:** `liveIdOf(el)` = `data-live-id`, else `id`, else a path anchored on the nearest one (depth ≤ 8).
  Hover and focus are throttled to 80ms and send `{ id, kind: "hover" | "focus" | "click" }`; the specimen shows the
  outgoing events in an `event-log` (`ol`, newest first, 6 rows) and a click raises a toast.
- **Peers:** an `outline` per peer (1.5px peer colour, a name chip, fades in place) and a `cursor` (arrow + name chip)
  that glides by `translate` 820ms. One name per peer: on the cursor while the room moves, on the outline when still.
  Peer colours come from `data-1…8`; chips are `text` on `surface-overlay` with a 1px peer-coloured ring (≥ 13:1).
- **Stops:** q — a still snapshot (each peer's outline on its element, no cursors). b / v — the scripted peers move
  every 1.7s. **Reduced:** outlines fade between elements, cursors hidden, no travel. Off-screen and page pause stop
  the script; "Pause peers" (`aria-pressed`) holds the room.
- **Presence:** a `presence` list ("Maya is on Step 2, 25%") gives the same information as words, not cursor
  positions. It is deliberately not a live region (a peer step every 1.7s would be noise); peers' layer is
  `aria-hidden`.
- **Responsive:** room and sidebar side by side ≥ 900px, stacked below; a ResizeObserver re-places outlines.
```ts
type LiveRoomProps = { peers: State<{ id: string; name: string; color: 1|2|3|4|5|6|7|8; target?: string; kind?: "hover" | "focus" }[]>;
  onTrack?: (e: { id: string; kind: "hover" | "focus" | "click" }) => void; snapshot?: Record<string, string>; children: Child };
```

## 4. Commerce

- **Product card** (`old:marketing/cards/ProductCard.tsx`): Frame (`imageRatio`, default 4:5) with `badge`, eyebrow,
  name, tags, price + compare-at (`<s>` with `sr` "was"), price meta, `cta`. Whole card is a link overlay; the CTA is a
  separate button. Hover: image `scale(1.03)` at vivid only (C), sweep on the card border.
- **Product gallery with zoom:** main `zoom` image (square) + `thumbs` (`aria-current`). Fine pointer: hover zooms
  2.2× following the pointer (`transform-origin`, no reflow). Touch and keyboard: tap / Enter toggles zoom; a second
  tap opens the Lightbox (§5.2) for pinch. Video slides show a play glyph and open in the media player. Sticky ≥ 860px.
- **Variant picker:** `fieldset` + `legend` with the chosen value in an `output`; colours are radio swatches
  (44px hit area, 2px ink outline when checked, name in `sr` and `title`); sizes are radio tiles; out of stock is
  `disabled` with a hatch and a described-by note; unavailable combinations stay focusable with "Notify me".
- **Reviews:** rating summary (score in display face, stars, count, 5→1 histogram as a labelled list), then the
  review list and "Write a review" (§4.2).
- **Cart drawer:** Sheet (`05`), right on ≥ 600px, bottom on phone with the drag handle. Lines (thumb, name, variant,
  quantity stepper from `03`, price, remove with undo toast), totals as a `dl`, coupon field, primary "Checkout".
  The cart badge in the top bar is a count Badge with a polite announcement on change.
- **Checkout steps:** Steps (`05`) in the sheet header (compact "Step n of 3" under 520px): Cart → Details → Done,
  each pane a fade. Details uses signature Fields with `autocomplete`. Done: the check pop, a toast, and confetti at
  balanced+ (§1.3). The full multi-page checkout flow, payments and order tracking belong to `app` (§2.6 rows); market
  supplies these display parts.

### 4.1 Template marketplace (the old sandbox "Marketplace" recipe)
- **Anatomy:** `stat-strip` (a `dl`: templates, installs this week, publishers, rating), then `market`: a `rail`
  (search Field, category chips with `aria-pressed`, price radiogroup Any / Free / Paid with roving tabindex, "4.7+"
  chip, sort `select`) beside `results` (`count` as `role="status"`, `applied` filter chips each removable, a `grid`
  of `listing` cards, an empty state with "Clear filters").
- **Listing card:** cover art (a generated thread motif per category), name (the card's link overlay), publisher,
  rating and installs, tags, price (`positive-text` "Free" or `$n` with `sr` "per month") and a separate soft
  "Install" button (confirms with a toast). The card is a sweep surface (vivid only, §0.3).
- **Responsive:** rail 250px + results ≥ 900px; below, the rail moves into a modal Sheet opened by "Filters" and moves
  back on close (focus returns to "Filters"); the applied chips stay visible above the results; results are 1 / 2 / 3 columns by container.
- **Motion:** results re-enter with the `list` effect; the count is announced once per change.
- **A11y:** search is a labelled `input[type=search]`; category and rating chips are buttons with `aria-pressed`;
  price is a radiogroup (roving tabindex, arrows); the count is a status region, so the reader hears "Showing 3 of 12
  templates" once per change.
```ts
type MarketplaceProps = { items: { id: string; name: string; by: string; cat: string; tags: string[]; rating: number; installs: number; price: number; art?: Child }[];
  categories: string[]; query?: Bindable<string>; sort?: Bindable<"popular" | "rating" | "new" | "price">; onInstall: (id: string) => Promise<void> };
```

```ts
type ProductGalleryProps = { media: { src: string; alt: string; kind?: "image" | "video" }[]; index?: Bindable<number>; zoom?: "hover" | "tap" | "none" };
type VariantPickerProps = { name: string; label: Child; kind: "swatch" | "tile"; value: Bindable<string>;
  options: { value: string; label: string; color?: string; disabled?: boolean; note?: Child }[] };
type RatingSummaryProps = { score: number; count: number; distribution: [number, number, number, number, number] };
```

### 4.2 Reviews (demo `#review-list`, sheet `#review-sheet`)
- **List:** `section[data-scope=reviews]`: `header` (h3, `count` as a polite status "Showing 4 of 7…", the "Write a
  review" Button), `tools` (a ToggleGroup radiogroup filter All / 5 / 4 / 3 or less, and a select Field for sort: most
  helpful, newest, highest, lowest), `list`, `more` ("Show more reviews": +3, focus moves to the first new title,
  which is `tabindex=-1`).
- **Review:** `article[data-scope=review]` labelled by its `title` (h4): `head` (stars as `role=img` "n out of 5
  stars", Verified purchase Badge, Pending Badge), `meta` (name, `time`, variant), `body` (68ch), `photos` (64px
  buttons that open the Lightbox on that review's photos and return focus), `foot` ("Was this helpful?" toggle
  Button with `aria-pressed` and the count, Report).
- **Write a review:** a Sheet (right from 600px, bottom on phones). `fieldset[data-scope=rating-field]` with a legend,
  the Rating input from `03` (five native radios; stars fill left to right with `data-on`, mouse hover previews with
  `data-preview`) and an `output` that names the choice ("4 of 5: Very good"); then title, the multi-line Field and
  name. Validation on submit: a rating is required and the body needs ≥ 20 characters (each failure sets
  `data-invalid` and its message; focus goes to the first). A sent review arrives at the top as Pending (fade in,
  `data-enter`) with a toast; filter and sort reset so it is visible.
- The Rating input and multi-line Field rules are restated in `warp-marketing.css` (CSS §22), so the store loads no
  inputs pack. They match `warp-inputs.css` and are identical when both load.

## 5. Media

### 5.1 Carousel (`old:carousel/*`, all modes kept)
- **Anatomy:** `region` (`aria-roledescription="carousel"`, label) › `controls` (`rotation`, `prev`, `next`, `fraction`,
  `dots`) › `progress` hairline › `viewport` (`tabindex=0`, `aria-live` polite when not rotating, off when rotating)
  › `track` › `slide` (`role=group`, `aria-roledescription="slide"`, "n of N").
- **Modes:** `slide` (scroll-snap, `per` 1/2/3 or `auto`, `peek` 44px under 700px, `gap`), `fade`, `scale` (Ken Burns
  feel), `stack`, `coverflow` (3D, ±58% / −160px / 32°), `marquee` (= §3.2 `cards`). Stacked modes place every slide
  in one grid cell and drive transforms from `--o` (signed offset −2…2); inactive slides are `inert`.
- **Governed modes:** `scale` and `stack` need balanced (else `fade`); `coverflow` needs vivid (else `slide`); under
  reduced motion every stacked mode is `fade` and smooth scrolling is off. The specimen shows the fallback in words.
- **Input:** swipe (native in slide; 40px pointer threshold in stacked), arrows on the viewport, Home/End, prev/next,
  dots (`aria-current`). Loop is seamless in stacked modes and a rewind in slide mode.
- **Autoplay:** allowed at balanced+ (opt-in) and auto-starts at vivid; never under reduced motion or the page pause.
  The rotation control is first in tab order; hover holds; focus entering the carousel stops rotation for good
  (APG); a hairline shows time to next slide.
```ts
type CarouselProps = { slides: { id: string; content: Child; label?: string }[]; mode?: "slide" | "fade" | "scale" | "stack" | "coverflow" | "marquee";
  per?: number | "auto" | { sm?: number; md?: number; lg?: number }; gap?: Space; peek?: number; loop?: boolean;
  autoplay?: number | false; arrows?: boolean; dots?: boolean; fraction?: boolean; ratio?: number;
  index?: Bindable<number>; label: string };
```

### 5.2 Lightbox and gallery (`old:overlays/dialogs/Lightbox.tsx`)
- **Gallery grid:** 2 cols phone, 3 cols ≥ 760px with the first item 2×2; captions appear on hover (always on touch).
  `selectable` adds selection for asset libraries (demo `#gallery` + `#gallery-bar`), below.
- **Selection** (`selectable`): each item is `div[data-part=item]` holding `open` (the button that opens the Lightbox)
  and `select` (a signature Checkbox on a raised chip, named "Select poster n, title"). The box shows on hover and
  focus, always on coarse pointers, and on every item once anything is selected (`data-selecting` on the grid). A
  selected item gets an accent ring and, at balanced+, its image insets by scale 0.94 (C). Click toggles; Shift+click
  or Shift+Space selects the range from the last toggled item (the anchor) to this one, to the anchor's state; while
  anything is selected a click on a poster toggles it instead of opening it (⌘/Ctrl+click always toggles). Ctrl/⌘+A
  and Esc clears while focus is in the grid or its bar; Delete / Backspace removes while focus is in the grid.
- **Selection bar** (`selection-bar`, sticky at `--warp-mk-sticky-offset`, accent-soft while `data-active`): a
  select-all Checkbox (`aria-checked` true / false / `mixed`, the mixed state draws a dash), `count` (`role=status`,
  "2 of 6 posters selected"), `actions` (Download, Delete in critical tone, both disabled at 0; Clear while any), and a
  `hint` with the keys (`aria-describedby` of the grid). Delete is immediate with an **Undo** action in the Toast (8s,
  held while hovered or focused), which restores the items and the selection. Focus moves to select-all after a
  delete.
- **Lightbox:** a full-screen `<dialog>` (near-black, opacity fade in and out): bar (`count`, zoom out, zoom in,
  close), `stage` (prev/next buttons, hidden on touch), `caption` (polite). Focus starts on Close and returns to the
  thumbnail. Background is opaque, so contrast holds on any image.
- **Gestures:** two pointers pinch 1–4× around the midpoint and pan with it; one pointer pans when zoomed, otherwise
  swipes ±60px to change image and swipes down 110px to close (image follows the finger, fades); double-tap toggles
  2.5× at the tap point; wheel / trackpad zooms at the cursor; keys ← → + − 0 Esc. Pan is clamped to the image.
```ts
type LightboxProps = { items: { src: string; alt: string; caption?: Child; srcset?: string }[]; open: Bindable<boolean>; index?: Bindable<number>; maxZoom?: number };
type GalleryProps = { items: LightboxProps["items"]; selectable?: boolean; selected?: Bindable<Set<string>>;
  onDelete?: (ids: string[]) => void | "undoable"; onDownload?: (ids: string[]) => void };
```
The Lightbox takes any list (the gallery, a review's photos), labels itself by it ("Photos from Maya A.") and returns
focus to the opener. The Toast gains an optional `action: { label, run }`.

### 5.3 Video and audio player chrome (demos `#video-player`, `#audio-player`, `#voice-note`)
- **Video:** native `<video>` (the clock, the captions renderer and the media's own accessibility) under a warp bar on a
  dark stage at every stop and theme: `stage` (video, `big-play` while idle, `badge-row` with the duration chip and
  the current chapter chip), then `controls`: the `scrubber` on its own row (rail with `buffered`, `hover` and
  `played` layers as `scaleX`, never width; chapter `ticks` as 2px gaps; a `thumb` shown on hover and focus; a hover
  `preview` "0:05 · Gate the merge" on fine pointers; a transparent native range on top for drag, keys and
  `aria-valuetext` "0:10 of 0:12, Roll out by canary"), then play, back 10s, mute, time (tabular mono), CC, speed,
  PiP, full screen. CC is a toggle (`aria-pressed`, track mode `showing` / `hidden`); speed cycles 1, 1.25, 1.5, 2,
  0.75× and names itself ("Playback speed: 1.5×"). Both are toggles rather than menus in the specimen; a player with
  several caption languages uses the Menu from `05` for CC. PiP and full screen hide when unsupported (iOS uses the
  native full screen). Under 420px of player width, back 10s, PiP and the total time hide. Under the player,
  `player-notes`: `chapters` (buttons, `aria-current` on the playing chapter), a `readout` and the `keys` legend.
- **Controls fade** after 2.5s without pointer movement while playing, on fine pointers only, never while focus is in
  the controls; a pointer move, focus or a player key brings them back. Click on the frame plays or pauses; double-click toggles
  full screen.
- **Keys** (focus anywhere in the player): Space (except on a button) and K play / pause, J / L ∓10s, ← / → ∓5s
  (also ↓ / ↑ and PageDown / PageUp ∓10s on the scrubber), M mute, C captions, F full screen, Home / End.
- **Poster:** a generated SVG or the `--_dominant` colour; never autoplays with sound. Muted autoplay (hero loops) is
  balanced+, pauses off-screen, and has a visible pause button (2.2.2). One medium plays at a time: starting one
  pauses the rest.
- **Audio:** on the page surface: play (accent, round; vivid square), `meta` (title, byline), `tools` (speed, download),
  `wave` (a canvas from precomputed peaks plus a transparent native range for AT and keys), time. Bars are 3px (2px
  compact) with 2px gaps, max of each bucket, centred (vivid: standing on a baseline); colours come from `--_bar`
  (`data-1`), `--_played` (accent) and `--_hover`, resolved through a probe so forced colours and themes apply. The
  canvas is DPR-aware (≤ 2) and drawn **only on change**: a frame while playing, on hover, on resize, on a theme or
  dial change; never while idle. Same keys minus M / C / F. A `transcript` disclosure lists the lines as buttons
  (`aria-current` on the spoken one; a click seeks and plays). `chrome="compact"` is the voice note in a thread: play,
  wave, time.
- **Binding (PLAN §6.3):** the chrome is a view of `timeline(media, { cues })`: boxes `currentTime`, `playing`,
  `duration`, `ended`, `cue`, plus `on(id, fn)` that fires when playback enters a cue. Frames come from
  `requestVideoFrameCallback` (video) or rAF (audio) and are scheduled only between `play` and `pause` and while the
  player is on screen; paused or off-screen it costs nothing (`timeupdate` and `seeked` keep the boxes and cues true
  meanwhile). The cue box updates before `currentTime`, so a time subscriber reads the matching chapter. Chapters and
  transcript lines are cues; the specimen's readout prints the boxes and the last `on()` firing.
```ts
type MediaPlayerProps = { src: string | { src: string; type: string }[]; kind: "video" | "audio"; poster?: string;
  tracks?: { src: string; lang: string; label: string; kind: "captions" | "chapters" }[]; peaks?: number[];
  cues?: { id: string; at: number; end?: number; label: string }[]; timeline?: Timeline;   // bring your own, or one is made
  transcript?: boolean; autoplay?: "never" | "muted-loop"; chrome?: "full" | "compact" };
type Timeline = { currentTime: Box<number>; playing: Box<boolean>; duration: Box<number>; ended: Box<boolean>;
  cue: Box<Cue | null>; on(id: string, fn: (c: Cue) => void): () => void };
```

### 5.4 Compare slider, QR and share
- **Compare:** two images stacked, the top clipped by `--_pos`; a 1.5–2px handle with a round grip; a transparent
  `input[type=range]` over the whole frame gives drag, keyboard and `aria-valuetext` ("80% after"). Labels in corners.
  Vertical orientation for tall images.
- **QR** (`old:display/media-actions/QRCode.tsx`; display owner is `comp`, market owns its marketing use): an SVG
  matrix in `text` ink on `surface-raised` (≥ 4.5:1 module contrast), quiet zone 4 modules, optional `framed` with the
  frame corners, optional centre mark ≤ 20% area at error level H. Label it with the URL in text.
- **Share** (`ShareButton`): `navigator.share` where present, else copy link with a "Link copied" toast; a menu fallback
  lists copy, email, X, LinkedIn. Never opens a network without a click.

### 5.5 P2 viewers
PDF / document viewer (page thumbnails rail, zoom, page n of N, text layer selectable), 3D model viewer (`<model-viewer>`
wrapped; auto-rotate is a governed loop, min vivid), image editor (crop from `04`, adjust sliders, annotate with the
`04` ink tools). Each reuses the Lightbox stage gestures and the bar layout.

## 6. Expressive catalogue (beyond §1.3)

| Effect (P2 unless noted) | Min | Below min / still | Reduced | Class · note |
|---|---|---|---|---|
| Shiny text, highlighter sweep (P1, shipped: §6.3) | balanced / quiet | plain ink / static mark | static | P / C · once on view; the highlighter draws L→R like the sweep |
| Word rotate, morphing text (P1, shipped: §6.3) | balanced / vivid | first word | first word | S · ghost holds the longest word; 2.5s per word, pausable |
| Text reveal on scroll (P1, shipped: §6.3) | balanced | full ink | full ink | C · word opacity by `view()` |
| Scroll progress bar (P1, shipped: §6.4) | quiet | — | stays (user-driven) | C · `scroll()` timeline, emphasis border |
| Container scroll (shipped: §6.4) | balanced | flat device | flat | C · `view()` tilt → flat |
| Scroll-velocity text (shipped: §6.4) | balanced (drift) / vivid (skew) | two centred lines | two centred lines | C · skew ≤ 6° from scroll velocity |
| Grid, dot, noise, retro-grid backgrounds (P1, shipped: §6.2) | quiet (static) | static pattern | static | static at every stop; only retro-grid moves (vivid, C, loop) |
| Light rays (shipped: §6.2); meteors, sparkles, particles | vivid | none | static (rays) / none | C · ≤ 24 nodes (rays 7), loop, off-screen paused |
| Progressive blur edges | balanced | gradient fade | same | static `backdrop-filter` stack; no animation |
| Animated list (items arrive) | balanced | instant list | instant | C · reveal stagger, max 6 |
| Animated beam / integration diagram | balanced | static connectors | static | P · dash-offset once per path |
| Globe, dotted world map | balanced | static map | static | S · globe rotates at vivid only, 1 canvas, pausable |
| Dock (magnify on hover) | vivid | plain toolbar | plain | C · scale ≤ 1.4, fine pointer, labels always present |
| Lens / magnifier | balanced | tap to open Lightbox | same | C · fine pointer only |
| Custom pointer / follow pointer | vivid | system cursor | off | C · never hides the system cursor over text or controls |
| Click effects (ripple, burst) | balanced (ripple) / vivid (burst) | none | none | C · once per click, ≤ 400ms |
| Animated terminal / code compare | balanced | static code | static | S · typewriter rules |
| TiltCard glare; MotionCard (shipped: §6.6) | vivid / balanced | flat | flat | C · `old:parallax/*` (ParallaxScene shipped: §3.13) |
| `fancy` presets: crt-on/off, flicker, glitch, iris, spotlight (shipped: §6.5) | vivid | the stop's plain enter/exit | fade | C · ≤ 400ms, flicker ≤ 2 flashes/s, never on text people read |
| Shader theme transition (P1, shipped: §6.1) | balanced | instant (quiet) | instant | C · View Transition, once ≤ 560ms |
| Ken Burns / parallax image slider | balanced | static slides | static | C · carousel `scale` mode + parallax |

### 6.1 Theme transition (`old:` `useShaderThemeTransition`)
The old hook painted a WebGL noise wipe on a full-screen canvas. warp gets the same "the new theme is woven in" read
with no GPU canvas: `themeTransition(swap)` wraps the theme write in `document.startViewTransition` and animates
`::view-transition-new(root)`'s `clip-path` through 24 baked polygon frames (WAAPI): a left-to-right front made of
staggered warp threads, so it reads as the sweep crossing the page.
- **vivid:** woven wipe, 560ms (the easing is baked into the frames) · **coarse pointer or < 768px:** a plain `inset()` L→R wipe, 420ms ·
  **balanced:** the default View Transition crossfade · **quiet, reduced motion, or no View Transitions:** instant.
- Old snapshot is never animated (no double exposure); `:root[data-theme-wipe]` scopes the pseudo rules so other
  view transitions (the dial crossfade) are untouched. The page stays interactive; a second change during a wipe applies
  instantly. Triggers: the top bar sun / moon toggle (`aria-label` names the target theme) and the bar's Theme radios.
- A11y: the toggle's `aria-label` names the theme it switches to and updates after the swap; focus stays on the
  trigger; the demo's note says which variant the current stop gets.

The old parallax hooks map to two primitives: `scrollFx(el, { from, to, range })` (a CSS scroll timeline, with an
IntersectionObserver fallback) and `pointerFx(el, write)` (rAF-batched custom properties). `useGlobalMouse`,
`useDocumentScroll` and `useInViewport` become `pointer()`, `scroll()` and `inView(el)` signals in weft.

### 6.2 Animated backgrounds (demo `#backgrounds`)
`backdrop` is a surface with an `aria-hidden` `bg` layer (`z-index: -1`, no pointer events) under its text; the same
layers serve heroes, CTA bands and the waitlist. All are gone in forced colours.
- **Grid** `data-bg="grid"`: two 1px line gradients in `border-strong` mixed by `--warp-fx-k`, under a radial mask.
  Vivid tightens the cell to 24px and marks every fourth line in the accent. Static.
- **Dot** `data-bg="dots"`: one radial-gradient tile (16px; vivid 18px, larger dots in the accent), fading up. Static.
- **Noise** `data-bg="noise"`: a static SVG `feTurbulence` tile blended `soft-light` over two `--warp-mk-art` washes;
  opacity follows fx-k, quiet drops the washes. Never animates.
- **Retro grid** `data-bg="retro"` `> plane > i`: a grid plane tipped back 64° in 3D under a fade mask. At vivid (`on`)
  its lines travel toward the reader by `translate3d` one cell per 1.6s (C, loop); otherwise a static plane.
- **Light rays** `data-bg="rays"` `> rays > i ×7` (each sets `--x --w --r --o --t --dl`): soft beams from the top edge on
  one statically blurred layer, swaying ±5° by `rotate` with opacity over 8–12s (C, loop). Exist at vivid only;
  under reduced motion they stay as still beams; below vivid the card shows its `note`.
- Both loops pause off-screen, under the page pause and under reduced motion, and count toward the two-loop budget.

### 6.3 Text effects (demo `#text-fx`)
The final string is in the tree from first paint; animated copies are `aria-hidden`; nothing reflows its line.
- **Shiny** `data-fx="shiny"`: `background-clip: text` with a gradient whose stops are all text inks (`text`,
  `--warp-mk-ink-1/2`, each ≥ 4.5:1), so every frame passes; the sheen crosses once on view (P, 1.1s); vivid replays
  it on hover. Quiet: plain ink. Forced colours: `CanvasText`.
- **Highlighter** `mark[data-fx="highlight"]`: a `::before` layer in `highlight-soft` (vivid: a lower marker band in
  `highlight-solid`, −1°) that draws in by `scaleX` from the reading start on view (C, once), staggered by `--_d`.
  Quiet: a static mark. Forced colours: `Mark` / `MarkText`.
- **Word rotate** `data-fx="rotate"` (balanced+) and **morphing text** `data-fx="morph"` (vivid): `sr` (rotate: the
  whole list, "agents, platform teams, auditors and on-call"; morph: the current word) + `live` (`aria-hidden`) holding
  a hidden `ghost` (the longest word, so the box never changes) and the current word. Rotate slides words out and in;
  morph swaps glyph by glyph (`[data-ch]`, 28 / 34ms stagger). Both run on **one shared 2.5s ticker** (a timeout, so
  one S loop), which stops when neither host is `on` and on screen, under the page pause, and with the section's own
  "Pause text". Below their stop: the first word, static, and no ghost.
- **Scroll reveal** `data-fx="text-reveal"`: each word (`[data-w]`, `--_k` its position 0…1) goes from a faint floor
  (0.42 − 0.2 × fx-k) to full ink on the paragraph's `view-timeline`; every word is at full ink once the paragraph's
  centre reaches the middle of the viewport. Without view timelines the one passive scroll listener (§6.4) writes
  `--_p`. Below balanced and under reduced motion: full ink.

### 6.4 Scroll-driven sections (demo `#scroll-fx`)
CSS scroll timelines first, off the main thread. Without them (`data-fallback`), **one** passive scroll listener
writes `--_p` (0…1) in a single rAF per scroll burst, and only for hosts in view; nothing runs while the page is still.
- **Scroll progress** `scroll-progress` (`#scroll-progress`): an emphasis-border bar on the top bar's bottom edge,
  `scaleX` on `scroll(root block)`. It shows reading position and moves only when the reader scrolls, so it stays at
  every stop and under reduced motion (the registry's `reduced: on`). Forced colours: `Highlight`.
- **Container scroll** `container-scroll` (`#container-scroll`): `intro` (eyebrow, title, lede) rises ahead of a
  `device > screen` that starts tipped back (8° + 14° × fx-k, scale 1.04) and lands flat by `cover 48%` of its view
  timeline. Below balanced and under reduced motion it is flat (`off`).
- **Velocity text** `velocity` (`#velocity`): two display-size rows (`aria-hidden`, with a `role=group` label on the
  host carrying the words once) drift opposite ways across the section's view timeline (balanced+); `[data-dupe]` makes
  them long enough. At vivid scroll speed adds a skew ≤ 6° that eases back to 0, in a rAF that exists only while it
  decays. Quiet and reduced motion: two centred, wrapping lines.

### 6.5 `fancy` motion presets (demo `#fancy`; `old:motion/presets.ts`)
`data-fx="fancy"` on any entering or leaving element; `data-run` names the preset, `data-shown` hides it after an exit.
At vivid (`on`) each is one run on `transform`, `opacity` and `clip-path`, ≤ 400ms: **crt-on** (a line opens to the
frame, 400ms), **crt-off** (the frame folds to a line, 320ms), **flicker** (two dips in 400ms; repeats within 1s are
ignored, so ≤ 2 flashes in any second), **glitch** (four clipped, offset bands, 320ms, `steps`), **spotlight** (a
circle opens from the press point `--sx/--sy`, centre for keys, with a fading glow, 340ms), **iris** (an octagon opens
from the centre, 360ms). Every other stop runs the stop's plain enter / exit (`mk-plain-in/out`); reduced motion makes
that a fade. Never on text people are reading.
```ts
fancy(el, "crt-on" | "crt-off" | "flicker" | "glitch" | "spotlight" | "iris", { at?: [x: number, y: number] }): Promise<void>
```

### 6.6 MotionCard (demo `#motion-card`; `old:` `MotionCard`, whileHover y −2, scale 1.01, tap 0.98)
A whole-card `button` (`aria-pressed` in a single-choice set; or a link) with `name`, `body`, a `check` shown while
pressed, and the surface sweep at vivid. Balanced: hover lifts the shadow (elevation 1 → 2), press scales to 0.98.
Vivid: hover also rises 2px and scales 1.01 on the pop spring. This is the documented, governed exception to 00 §10's
"cards don't move on hover": vivid only, transform only, never layout, and the content never shifts under the pointer
by more than 2px. Quiet and reduced motion: shadow and colour only.

### 6.7 Canvas and dither

The site's hero loom and the icons' shaded depth, as a family. `@weft/ui-core/canvas` is a surface (`surface(canvas, { draw })`):
pixel ratio, resize, a pause off screen and in a hidden tab, one still frame under reduced motion, and one shared
`requestAnimationFrame`. With nothing to paint no frame is scheduled. `@weft/ui-core/dither` is the engine: tiles (Bayer 2/4/8,
blue noise, halftone), error diffusion (Floyd-Steinberg, Atkinson) for stills, fields, masks and a spring lattice for the pointer.

```tsx
<DitherField fill pointer={['pull', 'shockwave']} fade="left" />   // a hero's background, behind its content
<Dither src="/team.jpg" alt="The team" />                          // a photo in warp's inks
<DitherGlyph text="warp" reveal={1.4} />                           // a word woven from the field
<Canvas draw={({ ctx, width, height, time }) => …} animate />      // anything else
```

| Registry | Min | quiet | balanced | vivid | Reduced | Class · budget |
|---|---|---|---|---|---|---|
| `dither` | quiet | `still`, 2 inks | `on`, half speed, 3 inks | `on`, 4 inks | `still`, no pointer | S · ≤ 2 ms a frame, pauses off screen |

The tier's numbers follow `--warp-x`, read where the canvas sits, so a `data-expression` island retunes it, and a
`--warp-dither-inks`, `-speed`, `-reach` or `-gain` set in CSS overrides one. Inks are the tone's `soft`, `border` and `text` tokens and `--warp-color-text`, which run
from the page outward in both themes, so one ramp reads in light and dark. A cell is a typed-array value, not a signal: the
loom's one signal per cell is a demonstration of weft, and a toolkit field should not pay for it. Canvas2D is the only
path: the look is a coarse grid of whole cells, which costs about a millisecond a frame, so WebGL would add bytes and spend a
scarce context to save nothing.

## 7. Accessibility checklist

- Carousel and fact carousel follow the APG carousel pattern (§5.1); slides beyond view are `inert` in stacked modes.
- 2.2.2: every > 5s motion has a pause; the page pause hides itself when nothing moves. 2.3.3: reduced motion removes
  parallax, tilt, coverflow, marquee travel and aurora drift, and keeps every state change visible.
- Animated text always has its final string in the accessibility tree from first paint (`sr`), and the animated copy
  is `aria-hidden`. Count-ups never announce intermediate numbers.
- Gradient text stays ≥ 4.5:1 at every stop; `forced-colors` drops the gradient to `CanvasText`. The forced-colors
  layer (CSS §20) also gives marketing parts system colours: sweep-surface borders (tiles, plans, lobby, listings) `CanvasText`, `Highlight` on
  hover and focus; peer outlines, rings and the current room step `Highlight`; the scene thread, rule, story rail and
  carousel progress `Highlight`; dots `CanvasText`; decorative art (aurora, grain, glow, beam, spotlight) hidden.
- Labels: every field has a real `<label for>` (the floating label's per-letter spans are `aria-hidden` beside an `sr`
  copy); decorative SVG icons are `aria-hidden` and `focusable="false"`; card titles are `h3` under section `h2`s.
- Targets: dots, swatches, footer links, lightbox tools, the brand links, the announce pill and the rating link
  reach `hit-min` (44px coarse); bespoke ones carry `data-hit` (`="text"` for standalone text links). Inputs are 16px on touch.
- Overlays (`dialog`, sheet, lightbox) trap focus natively, close on Esc, and restore focus.
- Pricing: the toggle is a radiogroup; the change is announced once; struck prices carry `sr` "was".
- Players: every control is a real button with a name that says its next action ("Pause", "Unmute"); toggles use
  `aria-pressed`; the scrubber and waveform are native ranges with `aria-valuetext`; captions come from a `<track>`;
  the transcript is in the page. Status lines (selection count, review count, place in line, contact success) are
  `role=status`.
- The forced-colours layer for v0.3 parts (CSS §29): backgrounds and the waitlist art hidden; post, MotionCard,
  selection bar and player borders `CanvasText` (`Highlight` on hover / focus / pressed / active); the shiny gradient
  becomes `CanvasText`, the highlighter `Mark`; text reveal at full ink; scroll progress, played range and changelog
  knots `Highlight`; the waveform's colours resolve to `CanvasText` / `Highlight` / `GrayText`; stars `CanvasText`;
  velocity rows unskewed.

## 8. Coverage

| COVERAGE row | Here |
|---|---|
| Carousel (all modes) · FactCarousel | §5.1 · §3.11 |
| ScrambleText, Typewriter · Confetti | §1.3, §6 · §1.3, §4 |
| Hero, CTA, FeatureGrid, LogoCloud, PricingCard, ProductCard, TestimonialCard, FAQ, NewsletterForm, Footer, SessionLobby | §3.1, 3.9, 3.4, 3.2, 3.7, 4, 3.6, 3.8, 3.9, 3.10, 3.11 |
| Lightbox | §5.2 |
| ScrollReveal, AnimatedGrid, MotionCard · `fancy` presets · shader transition | §1.3 `reveal`, §6.6 (demo `#motion-card`) · §6.5 (demo `#fancy`) · §6.1 (demo: top bar toggle, gallery section) |
| Parallax, ParallaxScene/Layer, TiltCard, MagneticElement, parallax hooks | §1.3, §3.13 (demo `#depth`), §6 |
| AutoTrack (owner `app`; marketing showcase) | §3.14 (demo `#together`) |
| Marketplace (template listing, filters, stat strip) | §4.1 (demo `#templates`) |
| Video, audio, gallery with selection, zoom viewer, PDF, 3D, image editor | §5.3 (demos `#video-player`, `#audio-player`, `#voice-note`), §5.2 (demo `#gallery` + `#gallery-bar`), §5.5 |
| Product gallery, variant picker, reviews, device mockups | §4, §4.2 (demo `#review-list`, `#review-sheet`), §3.12 |
| Bento, marquee, pricing toggle + matrix (P0) | §3.4, §3.2, §3.7 |
| Spotlight, border beam, animated backgrounds, text effects, scroll-driven sections, compare | §1.3, §6.2 (demo `#backgrounds`), §6.3 (demo `#text-fx`), §6.4 (demos `#scroll-progress`, `#container-scroll`, `#velocity`), §3.5, §5.4 |
| Testimonial wall · team, blog, changelog, contact, waitlist · 404 | §3.6 (demo `#wall`) · §3.12 (demos `#team`, `#blog`, `#changelog`, `#contact`, `#waitlist`) · §3.12 |
| Particles, animated list and beam, globe, dock, lens, pointer, click effects, progressive blur, terminal, Ken Burns | §6 |
| Cart drawer, checkout (owner `app`) · QR, Share (owner `comp`) | display parts in §4 · marketing use in §5.4 |

## 9. Specimen

[specimens/marketing.html](specimens/marketing.html) is a fictional product ("Tensile") landing page: announcement bar,
top bar with the page pause, theme toggle and cart, hero (4 layouts), logo marquee with its pause, count-up stats,
spotlight bento, the ParallaxScene, vivid word band, scroll story, testimonial carousel (5 modes, governed), poster
gallery with pinch-zoom lightbox, compare slider, confetti and the theme-transition demo, pricing with toggle, beam
and comparison table, template marketplace, store (zoom gallery, variants, reviews, cart sheet with checkout steps),
lobby with countdown and fact carousel, the live room, FAQ, CTA, newsletter field, footer.

[specimens/marketing-more.html](specimens/marketing-more.html) is the second page, loading the same files (`warp.css`,
`warp-components.css`, `warp-marketing.css`, `warp-bar`, `warp-sweep`) with the same governor and its own registry
table: `fancy` presets `#fancy`, MotionCard `#motion-card`, video `#video-player` and audio `#audio-player` /
`#voice-note` (`#video`, `#audio`), backgrounds `#backgrounds`, text effects `#text-fx`, scroll-driven `#scroll-fx`
(`#scroll-progress` in the top bar, `#container-scroll`, `#velocity`), the wall `#wall`, and the section set `#team`,
`#blog`, `#changelog`, `#contact`, `#waitlist`. `?fallback` forces the scroll-timeline fallback; `?seen` marks every
one-shot as seen. Its media is generated and tiny, in `specimens/assets/` (≈ 370 KB): `tour.webm` / `tour.mp4`
(480×270, 12s, three chapters), `tour.en.vtt` captions, `tour.chapters.vtt`, `standup.webm` / `standup.m4a` (22s voice
note) and `standup.en.vtt`; the 160 waveform peaks are inlined. The landing links to it from the top bar ("More"), the
footer (Careers, Changelog, Blog), the mobile menu and the bar's Pages extra. On the landing, the gallery gained
selection (`#gallery-bar`) and the store gained the review list and sheet (`#review-list`, `#review-sheet`).

Local token: `--warp-mk-sticky-offset` (72px; the specimens set bar height + 72px) is where sticky marketing parts dock
(selection bar, changelog dates). It belongs in foundations' sticky set if another area needs it.

The settings bar is the canonical one (01 §13): Expression · Fields · Theme · Density · Motion (Auto / Full /
Reduced) · Flair, then the page extras Accent (5 brands, including near-neutral ink), Hero layout and View. Inline
≥ 1024px (it may wrap to two rows; the landing's sticky nav docks under its measured height); below that one 56px row
with a Settings button that opens the sheet. Auto removes the attribute; keys 1 / 2 / 3 flip the dial with a View
Transition crossfade; the theme runs §6.1. **Devices** shows the same page in 1280, 834 (coarse) and 390 (coarse)
iframes driven by the bar. Below the page, the governor table shows each effect's live state. All art is generated
SVG. URL state holds only what differs from the default:
`?expression=vivid&theme=dark&fields=boxed&density=compact&motion=reduce&flair=none&accent=300-0.14&hero=editorial&view=devices`
(the old `?x=`, `?h=` / `?c=` still parse).
