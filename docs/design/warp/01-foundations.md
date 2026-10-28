# warp 01 — Foundations: the token spec

Status: v0.2, 2026-10-28 (review fixes: §14 lists what changed and what other areas must adopt). Implementation: [tokens/warp.css](tokens/warp.css) (hand-written for v0; `weft tokens build`
will emit it from DTCG). Direction and rationale: [00-direction.md](00-direction.md). Citations as in 00 (`old:`,
`old@main:`).

---

## 1. Layers and naming

```
seed (≈8 values, Zod) → ref (ramps, raw scales, per-stop inputs) → sys (roles) → component (escape layer) → CSS vars
```

| Layer | Who edits it | CSS prefix | Example |
|---|---|---|---|
| **seed** | users, agents, `weft.config.ts` | `--warp-seed-*` | `--warp-seed-accent-h: 152` |
| **ref** | the build only; never read by components | `--warp-ref-*` | `--warp-ref-control-md: 36px` |
| **sys** | read by every component and adapter | `--warp-{group}-{role}` | `--warp-color-accent-on-solid` |
| **component** | `theme.components` in config | `--warp-{component}-*` | `--warp-button-flair` (later) |

**DTCG ↔ CSS rule (one rule, no exceptions):** the CSS name is `--warp-` + the DTCG path with dots → dashes, and a
trailing `default` leaf is dropped. `color.text.default` → `--warp-color-text`; `color.accent.on-solid` →
`--warp-color-accent-on-solid`; `text.title.size` → `--warp-text-title-size`. The DTCG source is 2025.10 with a
resolver over `scheme × expression × density`; springs live in `$extensions["dev.weft.spring"]` and compile to
`linear()`.

**Inputs vs derived.** Inputs (seed, dial, density, form, pointer, motion) are inherited custom properties.
Sys tokens are re-declared on `:root, [data-expression], [data-density], [data-form], [data-pointer],
[data-motion], [data-flair], [data-warp]` (`warp.css` §2, "SYS TOKENS"), so any island recomputes from its own inputs. Colours
are `light-dark()` values, resolved where they're used, so a `data-theme` island needs no re-declaration at all.

## 2. Scales

### Space (relationships; `density-k` = 0.75 / 1 / 1.25)

| Token | Cozy | Use |
|---|---|---|
| `space.hair` | 2 | icon to label nudge, stacked hairlines |
| `space.tight` | 4 | label to control, chip gap |
| `space.related` | 8 | items in one group, button gap |
| `space.group` | 16 | between groups, card internals |
| `space.section` | 48 / 40 / 32 by form | between page sections (not density-scaled) |
| `space.page` | 32 / 24 / 16 by form | page gutter (not density-scaled) |
| `pad.control` · `pad.surface` | 12 · 20 | control inline padding · card padding |

### Size and control heights

| Token | Compact | Cozy | Comfortable | Coarse pointer |
|---|---|---|---|---|
| `control.sm` | 24 | 28 | 32 | ≥ 36 visual + 44 hit area |
| `control.md` | 32 | 36 | 40 | ≥ 44 |
| `control.lg` | 40 | 44 | 48 | ≥ 48 |
| `hit-min` | 24 | 24 | 24 | 44 |

Icons 14 / 16 / 20, stroke 1.5. Switch track 36×20, checkbox 20 (hit area `hit-min` via `::after`).

**The touch floor is in `warp.base`, so it holds without component code.** Every `[data-scope="button"]`,
`[data-scope="toggle"]`, `[data-part="close"]`, `[role="tab"]`, `[data-scope="status-bar"] > button` and any
`[data-hit]` gets `min-block-size: hit-min` (icon-only buttons, close, toggles and `[data-hit]` also
`min-inline-size`). A standalone link button (`data-emphasis="link"` not inside running text) and `[data-hit="text"]`
become a `hit-min`-tall inline-flex row. It is a *min*-size: on a mouse `hit-min` is 24, so visual sizes don't move; on
a coarse pointer an sm button grows to 44. Controls that must keep a smaller visual box (chips, checkbox, slider rail,
swatches) draw a `hit-min` hit area with `::after` instead. Anything bespoke and tappable: add `data-hit`.

### Type (role tokens: `text.{role}.{font,size,leading,weight,tracking,case}`)

| Role | Size d / t / p | Leading | quiet | balanced | vivid |
|---|---|---|---|---|---|
| display | 52 / 42 / 34 (vivid × 1.18) | 1.04 | Inter 600, −0.035em | Space Grotesk 500, −0.03em | Instrument Serif 400, −0.015em |
| title | 30 / 26 / 24 (vivid × 1.14) | 1.15 | Inter 600 | Space Grotesk 500 | Instrument Serif 400 |
| heading | 20 / 19 / 18 | 1.3 | sans 600, −0.01em | sans 600 | sans 500 |
| body · prose | 14·16 / 15·17 / 16·17 | 1.55 · 1.65 | Inter 400 | Inter 400 | Space Grotesk 400 |
| label (field) | 13 | 1.25 | Inter 500 | Inter 500 | Plex Mono 500 caps 11, +0.1em |
| eyebrow, badge | 12 / 11 caps | 1.25 | Inter 500 | Plex Mono caps, +0.08em | Plex Mono caps, +0.14em |
| caption | 12 / 12 / 13 | 1.45 | sans 400 | sans 400 | sans 400 |
| code | 13 / 13 / 14 | 1.55 | IBM Plex Mono | IBM Plex Mono | IBM Plex Mono |
| button | body size (vivid −2, caps) | 1 | Inter 500 | Inter 500 | Plex Mono 600 caps, +0.1em |

Title tracking = display tracking × 0.6. Controls use `text.control.size` = max(body, 16px on coarse pointers).

| Token | quiet · balanced · vivid | Rule |
|---|---|---|
| `text.numeric.font` · `text.numeric.variant` | Inter · Space Grotesk · **Space Grotesk** · `tabular-nums lining-nums` | Instrument Serif has no `tnum`, so vivid figures that update or align (KPIs, timers, tables, deltas) use the sans. `[data-numeric]` applies both; `table` and `time` get the variant |
| `text.emphasis.style` · `text.emphasis.color` | normal · normal · **italic** · `accent.text` | `<em>` in `h1`–`h6`. Headings set `font-synthesis-style: none`: Space Grotesk and Inter-as-display have no italic face, so emphasis there is upright accent; vivid uses the serif's real italic. The browser never slants a roman |

### Radius, border, focus

| Token | Formula | quiet | balanced | vivid |
|---|---|---|---|---|
| `radius.control` | 8 − 6x | 8 | 5 | 2 |
| `radius.surface` | 12 − 10x | 12 | 7 | 2 |
| `radius.mark` (checkbox, kbd, bar ends) | 4 − 2x | 4 | 3 | 2 |
| `radius.round` (chip, switch, avatar) | per stop | 999 | 999 | 2 |
| `border.hairline` | — | 1 | 1 | 1 |
| `border.emphasis` | 1 + x | 1 | 1.5 | 2 |
| `focus.width` · `focus.offset` | — | 2 · 2 | 2 · 2 | 2 · 2 |

### Elevation and surfaces

`surface.{page, base, raised, overlay, sunken, hover, active, inverse}` plus `scrim`. Elevation is a ladder of
shadow recipes whose alpha is multiplied by `ref.depth` (1 / 0.7 / 0.35):

| Token | Recipe (light; dark uses black at ~5× alpha) | Pairs with |
|---|---|---|
| `elevation.0` | none | page, sunken |
| `elevation.1` | 0 1px 2px α.07 | raised (cards) |
| `elevation.2` | 0 1px 3px α.06, 0 6px 16px −4px α.10 | popover, menu, toast |
| `elevation.3` | 0 2px 6px α.07, 0 18px 40px −8px α.16 | dialog, sheet |

`blur.overlay` = 12 × (1 − x): 12 / 6 / 0px.

### Z-index, opacity, state

z: `base 0 · raised 1 · sticky 100 · dock 200 · overlay 300 · menu 400 · modal 500 · toast 600 · tooltip 700`.
`opacity.disabled` 0.45 everywhere (replaces 0.35 vs 0.55, `old:theme/tokens.css:535,971`). State layers:
`state.hover` 0.07, `state.press` 0.11, as currentColor over any non-solid fill. Solid fills use `solid-hover`.

### Motion

| Token | Value (balanced) | Rule |
|---|---|---|
| `duration.instant` · `fast` · `base` · `slow` | 80 · 120 · 200 · 320ms | × `motion-k` (0.85 / 1 / 1.2), × 0.6 when reduced |
| `duration.exit-k` | 0.7 | exit = enter × 0.7 |
| `sweep.duration` | 480 / 620 / 700ms by stop | × `motion-scale`; 0 when reduced (instant colour change) |
| `ease.out` | quiet `(0.2,0,0,1)`, else `(0.16,1,0.3,1)` | enters (`old:motion/presets.ts:41`) |
| `ease.in` | `(0.4,0,1,1)` | exits |
| `ease.in-out` | `(0.65,0,0.35,1)` | moves, sweep (`old:motion/presets.ts:42`) |
| `ease.pop` | ease.out; vivid: spring k380 c20 m0.5 as `linear()` | thumbs, pops (3.5% overshoot, ~320ms) |
| `motion.distance` · `motion.scale-from` | 4 / 8 / 12px · 0.985 / 0.97 / 0.95 | × `motion-scale` |
| `stagger` · `stagger-max` | 16 / 32 / 48ms · 6 | enters only |

Keyframes `warp-enter`, `warp-exit`, `warp-fade-in/out`, `warp-shimmer`, `warp-pulse` ship in `warp.base`.

**Nothing loops while idle under reduced motion, enforced in `warp.base`** (OS `reduce` unless the app chose
`data-motion="full"`, or `data-motion="reduce"` on any scope):
1. every animation runs **at most once** (`animation-iteration-count: 1 !important` on everything);
2. idle loops stop: `[data-shimmer]`, `[data-scope|part="skeleton"]`, `[data-skeleton]`, `[data-scope|part="shimmer"]`,
   `.edge[data-live]`, and anything marked **`[data-loop]`** (and their `::before`/`::after`) get `animation: none`;
3. spinners keep a status signal: `[data-scope="spinner"]`, `[data-part="spinner"|"spin"]` and an indeterminate
   progress range become a 1.2s **opacity** pulse (`warp-pulse`), with no rotation or travel.

These are `!important` inside `warp.base`, the second layer, so they beat any later layer's `!important` too: a
component's own reduced-motion rule (say, shortening every chart animation to 120ms) can't turn an infinite shimmer
into a strobe. `--warp-loop-play` (`running`, `paused` under reduced motion) is the token a loop reads for
`animation-play-state` when it should hold its frame rather than restart. Never fake a pause by dividing a
duration by `max(motion-scale, 0.001)`: that keeps a compositor animation alive.

### Signature: sweep, frame, rails, floating field (`@layer warp.signature`)

| Token | quiet · balanced · vivid | Notes |
|---|---|---|
| `sweep.duration` · `sweep.ease` | 480 · 620 · 700ms · `(0.65,0,0.35,1)` | `old:components/overlays/primitives/SweepBorderOverlay.tsx:31-61` |
| `sweep.width` · `sweep.base-width` | 1 · 1.5 · 1.5px · 1px | stroke thickens with the dial, the resting border never does |
| `color.sweep` | full accent: light L 0.515, dark L 0.60 | never low-chroma; ≥ 3:1 vs base and surfaces (§6) |
| `color.sweep-base` | `text` at every stop | ink-strength resting border (`FloatingBorderInput.tsx:20-33`) |
| `color.sweep-critical` | `critical-solid` | invalid fields pin the sweep "in" |
| `sweep.buttons` · `sweep.surfaces` | 1 · 1 · 1 / 0 · 0 · 1 | the dial never removes a sweep; surfaces are opt-in reach below vivid. `data-flair="sweep"` sets both 1, `"none"` is an author opt-out |
| `frame.track` · `frame.corner` · `frame.weight` · `frame.stroke` | ink (light), ink 62% (dark) · 10px · 2px · 2.6 | frame button, `old:theme/tokens.css:317-493` |
| `frame.head` · `frame.tail` | registered `<number>`, 0 → 1 on `sweep.ease` | outline drawn in CSS (six segments sized in `cq` units), so no SVG dash gaps past ~200px |
| `field.height` · `color.field` | 40px cozy · `surface-raised` / `surface-raised` / accent-soft 35% into `surface-raised` | the resting fill. Forms on any brand stay neutral (review 02 M1) |
| `color.field-active` | `surface-raised` / `accent-soft` / `accent-soft` | hover, focus, open picker: the tint arrives with the sweep |
| `label.float.{size,weight,tracking,offset}` | 10px (11px on coarse) · 600 · 0.12em · −7px | the one sub-11px caps exception (00 §4); `label-background.ts:64-82` |
| `label.float.duration` · `label.float.ease` | 520ms · `(0.16,1,0.3,1)` | 120ms fade when reduced |
| `color.label` · `label-rest` · `label-active` | `text-subtle` · accent + 40% black · `color.sweep` | per-letter tint, delay = x ÷ sweep speed |

**Label anatomy (binding).** The label is the input's real `<label data-part="label" for="…">`, never
`aria-hidden`, and the input has no `aria-label`. `floatingLabel()` rewrites its text once into two parts:

```html
<label data-part="label" for="f-email">
  <span data-part="label-text">Email address</span>          <!-- visually hidden, text-transform: none: the name -->
  <span data-part="label-chars" aria-hidden="true">           <!-- what you see: one span per letter -->
    <span data-char data-c="E"></span><span data-char data-c="m"></span>…
  </span>
</label>
```

The letters are generated content (`[data-char][data-c]::before { content: attr(data-c) }`, in `warp.signature`), so
the accessible name, `innerText`, copy and find-in-page come only from `label-text`: sentence case, whole words, even
while the label is floated in caps. The label is `display: block` and the spans `display: inline`; a flex label or
inline-block spans spell names out letter by letter (review 03 B1). The older single-layer form (inline
`<span data-char>` with the letter as text, real spaces) still renders and still names correctly, but Chrome then
reports a floated name in caps; use the two-part form. Hints and errors get an id and join the input's
`aria-describedby`; invalid inputs also set `aria-invalid="true"`. Pattern from the layout area
(`specimens/layout.html`), now shared.

**Caps are visual.** `text-transform: uppercase` (eyebrows, the floated label, vivid buttons) is a rendering choice.
Chrome applies it in `innerText` and in name computation, so a test or an accessibility-tree dump shows
"REVENUE · MRR". Screen readers still read the words, not letters, so this is acceptable for eyebrows and buttons. Rules:
author the source text in sentence case (never type capitals), never put meaning in case alone, and where a name is
compared against something (labels, label-in-name) use the label pattern above.

**Reserved custom properties.** `--_on` is the sweep switch: a **number** (0 or 1, from `sweep.buttons` /
`sweep.surfaces` / `data-flair` / `data-confirm`) that `warp.signature` multiplies into opacity and clip. Never assign
it a colour or anything else. Name component tone colours differently (`--_tone`, `--_solid`, `--_ink`); a colour in
`--_on` silently turns the sweep off (it happened on the data page). `--_base` is the host's resting-border colour.

**Restoring the ink base.** A component that sets its own border colour on a sweep host and wants the signature ink
resting border back sets `--warp-color-sweep-base: inherit` on that same element. No raw ref token needed.

**Duration is cached.** `warpSweep.duration(el)` is cached per (expression, motion, OS reduced motion, host kind),
so a dial switch costs nothing (was ~19ms). A page that overrides `--warp-sweep-duration` inline on a host opts out
with `data-sweep-duration="live"` on it or an ancestor.

**Behaviour contract** (weft's `sweep()` / `floatingLabel()`, ~60 lines in the specimen): one attribute,
`data-phase="idle|in|out"`, on the `[data-sweep]` host, run by the one shared machine (`specimens/warp-sweep.js`,
SIGNATURE §4). Active (hover, or focus-within for fields and focus-visible otherwise) → `in`; inactive while `in` →
`out`; `transitionend` of the travelling part (or duration + 150ms backstop, e.g. a pinned invalid field) →
`idle`. Re-entry during `out` snaps to `idle` (one style flush) and then `in`, so every entry draws left to right
(SIGNATURE §1.4). With duration 0 it skips `out`. Parts: `sweep-base`,
`sweep`, `sweep-fill`, `frame-corners`, `sweep-corners`, `sweep-outline`, `sweep-label`, `sweep-content`, `rail-fill`,
`rail-hover`, `thumb`, field `control`/`label`/`input`/`icon`/`message`.

## 3. Light and dark

- No attribute: `:root { color-scheme: light dark }` and every colour is `light-dark(L, D)`, so the OS decides
  with no JS and no flash. `data-theme="light|dark"` pins it on any element; islands nest.
- The no-flash script (weft/start) only sets `data-theme` before paint when the user picked one.
- Dark is tuned, not inverted: page L 0.155, surfaces step +0.03, solids get *lighter* (accent L 0.76) and take
  dark ink, soft tints are dark (L 0.26–0.29) with light tone text.

## 4. Density

`data-density="compact | cozy | comfortable"` (default cozy) sets `density-k` and the control-height row in §2.
It scales spacing and control heights only, never type size (fixes the root-font-size hack). Density nests: a
compact table inside a cozy page is one attribute.

## 5. The expression dial

Inputs per stop live in `warp.css:46-131`; §3 of 00 lists every value. Continuous tokens are formulas of `--warp-x`
(radius, emphasis, blur); discrete ones (fonts, caps, curves) are set per stop. A config value like
`expression: 0.3` emits the nearest stop's discrete inputs plus `--warp-x: 0.3`. The sweep and floating field run at
every stop; the dial sets only their speed, stroke width and reach. `data-flair="sweep|none"` widens or narrows
the reach within its scope (fields always sweep).

## 6. Contrast: how on-colours are computed

Per tone and theme the build:
1. fixes `solid` lightness from the stop table (light L 0.50–0.54 for dark-ink-incapable hues, 0.80–0.87 for
   yellow/lime, which take dark ink; dark mode 0.70–0.86, all dark ink);
2. caps chroma at the sRGB edge for that L and hue (the `min(…, cap)` values in `warp.css`), so no browser
   gamut-clips and shifts contrast;
3. **searches OKLCH lightness** for `on-solid`, starting at the far end (0.985 or 0.17) and stepping toward the
   fill, keeping the lowest-chroma ink that passes ≥ 4.5:1 against **both** `solid` and `solid-hover`;
4. searches `text` lightness so it passes ≥ 4.5:1 on page, surface, raised, sunken, its own `soft`, and `soft`
   under the 11% press layer;
5. fails the build with the nearest passing L (the script's `try L 0.645` hint) when no value fits.
`focus` and `border.control` are searched for ≥ 3:1 against every surface. Nothing is tone-derived without a
check, which removes the invisible neutral ring (1.13:1) and the hard-coded `--btn-ink` (`old:theme/tokens.css:257`).

**Results** — `node scripts/contrast-check.mjs --md`, run 2026-10-28 against `tokens/warp.css`:

Checked 858 pairs (143 × 6 combinations): **858 pass, 0 fail.**

| Group | Need | Pairs | Lowest | Where | light q/b/v (min) | dark q/b/v (min) |
|---|---|---|---|---|---|---|
| Text on surfaces | 4.5:1 | 78 | **5.74** | light/quiet `text-subtle` on `surface-hover` | 5.74 / 5.74 / 5.74 | 6.72 / 6.71 / 6.72 |
| Faint text (meta, AA) | 4.5:1 | 30 | **4.63** | light/quiet `text-faint` on `surface-sunken` | 4.63 / 4.63 / 4.63 | 4.67 / 4.67 / 4.67 |
| Control boundary | 3:1 | 24 | **3.13** | light/quiet `border-control` on `surface-sunken` | 3.13 / 3.13 / 3.13 | 3.54 / 3.53 / 3.54 |
| Focus ring | 3:1 | 30 | **4.54** | light/vivid `focus` on `surface-sunken` | 4.61 / 4.55 / 4.54 | 9.29 / 9.39 / 9.48 |
| On-solid ink | 4.5:1 | 84 | **4.99** | light/vivid `positive-on-solid` on `positive-solid` | 5.06 / 5.02 / 4.99 | 6.78 / 6.70 / 6.65 |
| Tone text (on surfaces + own soft) | 4.5:1 | 210 | **5.36** | light/quiet `caution-text` on `surface-sunken` | 5.36 / 5.38 / 5.39 | 8.00 / 8.04 / 8.06 |
| Pressed state layer | 4.5:1 | 54 | **4.52** | dark/quiet `positive-text` on `positive-soft+positive-text@0.11` | 4.93 / 4.97 / 4.98 | 4.52 / 4.53 / 4.54 |
| Accent fill as UI (checkbox, switch) | 3:1 | 18 | **5.20** | light/vivid `accent-solid` on `page` | 5.29 / 5.24 / 5.20 | 8.51 / 8.60 / 8.69 |
| Sweep stroke + resting border (UI) | 3:1 | 84 | **4.01** | dark/vivid `sweep` on `field-active` | 4.79 / 4.66 / 4.67 | 4.72 / 4.02 / 4.01 |
| Sweep vs resting border (visible swap) | 3:1 | 12 | **3.04** | dark/vivid `sweep` on `sweep-base` | 3.13 / 3.15 / 3.15 | 3.06 / 3.04 / 3.04 |
| Floating label (notch + field) | 4.5:1 | 138 | **4.61** | light/vivid `label-active` on `field-invalid` | 4.64 / 4.61 / 4.61 | 6.26 / 5.90 / 5.89 |
| Data-viz marks | 3:1 | 96 | **3.47** | light/quiet `data-2` on `page` | 3.47 / 3.50 / 3.50 | 7.09 / 7.02 / 6.97 |

Tones checked: neutral, accent, positive, caution, critical, info, highlight. No colour needed gamut mapping.
**Sweep visibility rule:** the stroke must clear ≥ 3:1 against the resting border it replaces *and* against every
surface a field sits on, at every stop in both themes. That pins it between the ink base and the surface (light
L 0.515, dark L 0.60, chroma ≥ 0.12–0.14 even for a grey accent). The floated active label uses the same accent,
lifted to L 0.70 in dark so it clears 4.5:1 as text.
**Three inks, all AA.** `text` · `text-subtle` · `text-faint` all clear 4.5:1 on page, surface, raised, overlay and
sunken. `text-faint` (light L 0.53, dark L 0.625) is the meta ink for timestamps, durations and secondary counts. It
used to be 3:1 and "decorative only", and that rule didn't hold: pages used it for information (review 03 M8), so it
was raised rather than policed. Disabled controls use `opacity.disabled`, not faint. Placeholders use `text-subtle`.
**Control hosts.** The script also reads every `tokens/warp-*.css` rule that re-points a control's resting border
(`--_base`, `--warp-color-sweep-base`) at a grey token and checks the sweep against it (≥ 3:1). Control *parts* such
as the shell switcher are reported as advisories.
`--full` lists every pair with hex values; `--json` exports the resolved tokens. The specimen re-measures the
same pairs live in the browser.

## 7. Form-factor tokens

| | phone `< 600` | tablet `600–1023` | desktop `≥ 1024` |
|---|---|---|---|
| Type | display 34 · body 16 | display 42 · body 15 | display 52 · body 14 |
| Section · gutter | 32 · 16 | 40 · 24 | 48 · 32 |

- Set by viewport media queries on `:root`, or forced with `data-form="phone|tablet|desktop"` on any element
  (embeds, previews, the specimen's frames).
- `(pointer: coarse)` or `data-pointer="coarse"` sets `target-min` 44px and `input-font-min` 16px; control
  heights take `max()` against them (`warp.css:181-192`).
- **Components respond to their container, not the window.** Use `@container` for layout; breakpoints above are
  for type and rhythm only. Container steps for layout: 600 and 1000px (see the specimen's mini app).

## 8. Theming API

```ts
// weft.config.ts
import { defineConfig } from "weft";

export default defineConfig({
  ui: {
    kit: "warp",                       // "warp" | "headless" | "none"  (§9)
    theme: {                           // Zod .strict(): unknown keys are errors
      seed: {
        accent: "oklch(0.55 0.12 152)",         // hue + chroma used; L is solved per theme
        neutral: { hue: 80, chroma: 0.005 },    // optional; else the stop's temperature
        status: { critical: "oklch(0.55 0.19 27)" }, // optional overrides, still checked
        focus: "accent",                        // or an oklch(); must clear 3:1
      },
      fonts: {                                  // role → family; loaded by weft/start
        sans: "Inter", display: "Space Grotesk", mono: "IBM Plex Mono",
      },
      expression: "balanced",           // "quiet" | "balanced" | "vivid" | 0…1
      density: "cozy",                  // "compact" | "cozy" | "comfortable"
      schemes: ["light", "dark"],       // drop one to ship single-scheme
      flair: { sweep: "auto" },         // reach: "auto" (by stop) | "on" (+buttons, cards) | "off" (fields only)
      fields: "floating",               // "floating" | "classic"  → data-fields on <html> (one switch)
      contrast: "AA",                   // "AAA" raises text to 7:1, UI to 4.5:1
      pins: { dark: { "color.surface.base": "oklch(0.2 0.01 80)" } }, // still contrast-checked
    },
    adapters: ["tailwind"],             // emits @theme inline aliases
  },
});
```

Runtime scoping is attributes, never providers: `<Surface scheme="dark" expression="quiet" density="compact">`
renders `data-theme`, `data-expression`, `data-density`.

**Field style is one switch.** `warp({ fields: 'floating' | 'classic' })` (or `theme.fields` above) writes
`data-fields` on the root, and that single attribute flips every field; no component code or markup changes.

| Scope | How | Wins over |
|---|---|---|
| App | `fields: 'classic'` → `<html data-fields="classic">` | default `floating` |
| Form / region | `<Form fields="floating">` → `data-fields` on the form | the app |
| One field | `<TextField variant="classic">` → `data-variant` on the field | form and app |

`floating` is the signature over-the-border label; `classic` puts the label above the box as plain text (no float,
no notch, no overlap) and keeps the sweep border and icon sweep. Same markup and the same `<label for>` in both;
it is pure CSS in `warp.css`. Native date/time inputs use the fixed-notch label in `floating`.

## 9. Opt-out levels

| Level | Changes | Markup | How |
|---|---|---|---|
| **1 Re-theme** | colour, fonts, dial, density, sweep | none | `theme` in config, or override `--warp-seed-*` / sys vars on a scope with `data-warp` |
| **2 Restyle parts** | any part's CSS | none | every component emits `data-scope`, `data-part` and state (`data-tone`, `data-emphasis`, `data-size`, `data-state`, ARIA). Target `[data-scope="button"][data-part="root"]`, or Tailwind `data-[part=label]:…`; `class` merges onto the root, `partClass={{ label }}` onto parts |
| **3 Headless** | all warp component CSS | none | `kit: "headless"`: same components, behaviour, a11y and attributes; only `warp.tokens` ships, so layout primitives and your CSS can still read tokens |
| **4 None** | no warp at all | n/a | `kit: "none"`; `weft check` D-codes for tokens switch off |

Forking a component to restyle it is diagnostic `D040`; level 2 is the supported path.

## 10. Cascade layers and interop

`warp.css` declares `@layer warp.tokens, warp.base, warp.signature, warp.layout, warp.components, warp.inputs, warp.data,
warp.app, warp.flows, warp.marketing;` and every selector outside tokens is
wrapped in `:where()` (specificity 0). Rules of the road:

- **Plain CSS / CSS modules:** unlayered styles beat all layers. Nothing to do.
- **Tailwind v4:** put warp first so utilities win, and alias tokens into the theme:
  ```css
  @layer warp, theme, base, components, utilities;
  @import "@weft/warp/warp.css";
  @import "tailwindcss";
  @theme inline { --color-accent: var(--warp-color-accent-solid); --radius-control: var(--warp-radius-control); }
  ```
- **Other layered systems** (Panda, vanilla-extract): declare `warp` before their layers.
- `!important` appears only in `warp.base`, for accessibility guarantees: the reduced-motion rules (§2 Motion),
  and keeping a loading button's label in the accessibility tree (its children hide by `opacity`, never
  `visibility`). In the second layer, those beat any later layer's `!important`.

## 11. For the next designers

- **Layout:** use `space.*` relationships and `@container` at 600/1000. `section`/`page` already change by form.
- **Inputs:** build on the signature field in `warp.css` (two stacked borders, floating label, notch); the sweep is
  the focus indicator for fields. Support both `data-fields` styles. Never draw a placeholder in `faint`.
- **Components:** read only sys tokens. One solid per region. Hover = state layer or `solid-hover`, never a hand-
  picked colour. Every component must render correctly with `data-expression` changed on an ancestor.
- **All:** run `node docs/design/warp/scripts/contrast-check.mjs` after touching a colour; add pairs there for any
  new fill/ink combination you introduce.

## 12. Forced colours (Windows High Contrast)

In forced colours the UA repaints everything with a handful of system colours. Left alone, "accent sweep over ink
base" becomes CanvasText over CanvasText, and every part drawn with a background (frame-outline segments, rail fill,
sweep fill) vanishes. `warp.signature` has a `@media (forced-colors: active)` layer. Every signature part opts out
(`forced-color-adjust: none`) and is redrawn with system colours, so each state differs in **colour and width**:

| State | Forced-colours rendering |
|---|---|
| Rest | `sweep-base` 1px `CanvasText` |
| In (hover, focus) | `sweep` **2px `Highlight`**; the base clips away as usual, also on dial-gated hosts (cards), since shadows are gone |
| Field focus | the sweep, plus `outline: 2px solid Highlight` (offset 2px) on the control |
| Invalid | sweep pinned in, **3px double `CanvasText`**; the message text carries the words |
| Frame button | corners `CanvasText`; outline segments and active corners `Highlight`; the label copy is hidden (redundant) |
| Solid button (sweep fill) | the fill would sit under `ButtonText`, so it slides in as an inset 2px `Highlight` ring |
| Rails | fill `Highlight`; thumb `CanvasText`, `HighlightText` when on; the inner hover sweep becomes the ring sweep |
| Segmented / indicator | indicator `Highlight`, the selected option's ink `HighlightText` |
| Floating label | `CanvasText` on `Canvas`, `Highlight` while active; the transparent resting placeholder stays transparent (the UA would otherwise force it to `GrayText` under the label) |
| Focus ring (everything) | `outline-color: Highlight` |

Components that add their own background-drawn state (a selected pill or an indicator) follow the same rule:
`forced-color-adjust: none` on that part, then system colours only (`Canvas`, `CanvasText`, `Highlight`,
`HighlightText`, `GrayText`, `ButtonText`, `ButtonFace`). Verify with CDP `Emulation.setEmulatedMedia` (`forced-colors:
active`) in light and dark.

## 13. The specimen settings bar (canonical, every page)

Every specimen uses one settings bar. It is the frame around "one system", so it is one component. The reference
implementation is `specimens/foundations.html` (`header[data-specimen-bar]`); the drop-in (markup, CSS, JS) is the
same code verbatim.

**One name per dial.** The visible label is the name; the radio value **is** the attribute value written on `<html>`,
and the same value is the deep-link parameter. `Auto` removes the attribute: the OS decides (theme, motion) or the
stop decides (flair). Order: Expression · Fields · Theme · Density · Motion · Flair, then a divider, then page extras.

| Label | Attribute | Options (label → value) | Default | URL |
|---|---|---|---|---|
| Expression | `data-expression` | Quiet `quiet` · Balanced `balanced` · Vivid `vivid` | balanced | `?expression=` |
| Fields | `data-fields` | Floating `floating` · Classic `classic` | floating | `?fields=` |
| Theme | `data-theme` | Auto (removed) · Light `light` · Dark `dark` | Auto | `?theme=` |
| Density | `data-density` | Compact `compact` · Cozy `cozy` · Comfortable `comfortable` | cozy | `?density=` |
| Motion | `data-motion` | Auto (removed) · Full `full` · Reduced `reduce` | **Auto**: never write `full` unless the user picks it | `?motion=` |
| Flair | `data-flair` | Auto (removed) · Sweep `sweep` · None `none` | Auto | `?flair=` |

Never "Dial", "Stop", "Page stop", "Sweep reach", "Comfy" or "Roomy". Page extras (foundations' Matrix, a frame's
expression) come after the divider and use the same `name = value` scheme. Group labels are 11px mono caps (the type
floor); each group is a `role="radiogroup"` with `aria-labelledby` on its label; options are visually hidden native
radios inside `<label>`s; changes update the URL with `history.replaceState`.

**Layout.**
- **≥ 1024px:** brand left, controls inline on the right. They wrap to a second row at most; the bar stays sticky.
- **< 1024px (tablet and phone):** **one 56px row**: brand and a `Settings` button (`aria-expanded`,
  `aria-controls`) with a summary of the current expression and theme. The button opens the controls as a sheet under
  the bar: full width, `surface-overlay`, `elevation-3`, `max-block-size: calc(100dvh - 56px)` with its own scroll,
  one row per group (label column 96px, segments fill the rest). Opening moves focus to the checked option of the first
  group; Esc and an outside tap close it, and Esc returns focus to the button.
- Segments are `hit-min` tall (44 on coarse). The bar pads by `env(safe-area-inset-*)`, and the page ships
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.

**Drop-in contract.**
- Markup: `<header data-specimen-bar data-flair-target="…">` › `.wb-row` (`.wb-mark` brand link, `.wb-toggle`
  button with `<small data-wb-summary>`) › `.wb-sheet#wb-sheet` holding the six groups (`data-ctl="expression"` …),
  an `<hr>`, then page extras.
- CSS: unlayered, every selector under `[data-specimen-bar]`, so it never collides with page styles.
- JS: one IIFE placed **right after `</header>`** (not deferred): it applies URL params to `<html>` before first
  paint. It writes the six standard attributes itself. `data-flair-target` (a selector list) also receives
  `data-flair` for pages whose surfaces read it locally.
- Every change, including the initial values once the DOM is ready, dispatches `warp-bar:change` on `document` with
  `detail: { name, value }`. Page extras listen for their own `name`. Set a value from code with
  `window.warpBar.set(name, value)`.

## 14. v0.2 changes other areas must know

| Change | Who acts | What to do |
|---|---|---|
| Field fill: balanced rests on `surface-raised`, vivid on a 35% hint; new `--warp-color-field-active` on hover and focus | inputs, everyone with fields | nothing, unless you hard-code `accent-soft` behind a field |
| Label anatomy: `label-text` (hidden name) + `aria-hidden` `label-chars` with `data-c` letters; label `display: block`, spans `inline` | inputs, rich, flows, data, marketing, app | drop `aria-hidden` on labels and `aria-label` on inputs; use real `<label for>`; generate the two-part label (§2) |
| `--_on` is reserved (a number, the sweep switch) | data, everyone with tone colours | rename tone colours `--_tone` / `--_solid`; never write a colour to `--_on` |
| `--warp-color-sweep-base: inherit` restores the ink base | components that recolour a host border | use it instead of a raw ref token |
| `warpSweep.duration()` cached | pages overriding `--warp-sweep-duration` inline | add `data-sweep-duration="live"` |
| `--warp-label-float-size` is 11px on coarse pointers | anyone hard-coding 10px | read the token |
| `text-faint` is now AA (4.5:1) | app, flows | your meta text passes now; still prefer `text-subtle` for anything primary |
| Reduced-motion loop rules in `warp.base` | data, components, app, flows, inputs, layout | mark any other idle loop `data-loop`; delete `/ max(scale, 0.001)` duration hacks; spinners need nothing |
| `--warp-loop-play` token | anyone with a loop that should hold its frame | `animation-play-state: var(--warp-loop-play)` |
| `--warp-text-numeric-font` / `-variant`, `[data-numeric]` | data (vivid KPIs, deltas), app (timers) | put live and aligned figures on it |
| `--warp-text-emphasis-style` / `-color`, `font-synthesis-style: none` on headings | components, inputs-rich, marketing heroes | drop `font-style: italic` on non-vivid heading `em`, or leave it: it now renders upright |
| Touch floor in `warp.base` | components (toggle group), rich (sm icon buttons), flows (`.link`), layout (status bar, close) | nothing for listed scopes; add `data-hit` / `data-hit="text"` to bespoke targets |
| Loading button keeps its name | components | hide the label with `opacity: 0`, not `visibility: hidden` (the base rule now forces it visible) |
| Forced-colours layer (§12) | everyone with background-drawn state | follow §12 for your own parts |
| Settings bar (§13) | every specimen | paste the drop-in; move page extras after the `<hr>` and listen for `warp-bar:change` |

