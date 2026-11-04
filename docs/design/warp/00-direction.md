# warp 00 — Art direction

Status: v0.2, 2026-10-28. Owner: foundations (art direction + design system). Downstream: layout, inputs,
components. Tokens: [01-foundations.md](01-foundations.md) · [tokens/warp.css](tokens/warp.css) ·
[specimens/foundations.html](specimens/foundations.html).

warp is weft's default toolkit. It keeps the predecessor toolkit's base idea (hairline chrome, a surface ladder,
mono caps labels, a left-to-right sweep) and rebuilds everything underneath it. Two shipped looks of that
predecessor become the two ends of one dial.

**Citations.** `old:` is the predecessor's `packages/ui/src/` on its shipped working tree (the "field" look);
`old@main:` is the same path on its `main` branch (the "clean" look). Full repo paths are in the
predecessor [research notes](https://github.com/Ravonus/weft/tree/archive/evals-2026-11/docs/research).

---

## 1. Principles (each one is a check, not a mood)

1. **Chrome is thinner than content.** No container border is heavier than 1px, and no surface carries both a
   strong border and a shadow above `elevation-1`. *Test:* grep components for `border-width` > 1px outside the
   emphasis line and the focus ring.
2. **Every pair passes, at every stop.** Text ≥ 4.5:1, UI marks, control boundaries and the focus ring ≥ 3:1, in
   light and dark, at quiet, balanced and vivid. *Test:* `node scripts/contrast-check.mjs` exits 0 (858 pairs, plus every control host in the component files).
3. **One dial, not seven knobs.** Expression changes type, shape, temperature, depth and motion together. Users and
   agents may pin a single token, but no component takes a "style" prop. *Test:* no component API mentions
   radius, font or duration.
4. **Motion explains, then gets out of the way.** Nothing loops while idle, nothing moves layout on hover, and
   nothing takes longer than `duration-slow × 1.2` (384ms) except the signature sweep and label float. Under reduced
   motion nothing loops at all (spinners become an opacity pulse), enforced in `warp.base`, not left to each component.
   *Test:* the specimen with reduced motion shows the same states with no translation, and `document.getAnimations()`
   lists nothing running but `warp-pulse`.
5. **Touch is first-class, not a patch.** On coarse pointers every target is ≥ 44px and input text is ≥ 16px,
   from tokens alone (`hit-min`, plus the touch floor in `warp.base`, 01 §2). *Test:* the 390px frame in the specimen; no consumer `min-h-11` patches.
6. **Intent names only.** Components read sys tokens (`color.accent.solid`, `space.related`), never ref values.
   *Test:* no `--warp-ref-*` outside `warp.css`.
7. **The page wins.** Every warp rule sits in `@layer warp.*` behind `:where()`. Any app CSS beats it without
   `!important`. *Test:* a one-class Tailwind utility overrides a warp component in the integration fixture.

## 2. "Thin and streamlined", in numbers

| Thing | Value | Why |
|---|---|---|
| Container and control border | 1px (`border.hairline`) | the predecessor's hairline (`old:theme/tokens.css:236`) |
| Emphasis line (selected tab, active nav, field focus edge, sweep) | 1 / 1.5 / 2px by stop | the only place weight grows |
| Focus ring | 2px solid, 2px offset, always | never thinner, never tone-coloured |
| Icon stroke | 1.5 on a 24 grid, drawn at 16px → 1px | matches the hairline exactly |
| Weights in use | 400 body, 500 UI/labels, 600 headings (quiet), no 700 | thin type, no shouting |
| Control height (cozy) | sm 28 · md 36 · lg 44 | one value across button, input, select, date |
| Chrome budget per surface | ≤ 1 border + ≤ 1 shadow; ≤ 2 nested bordered boxes | stops "box in a box in a box" |
| Whitespace | `related` 8 · `group` 16 · `section` 32–48 · `page` gutter 16–32 | about 1.5× the content's own line gap between groups |
| Dividers | `color.border` (≈1.2–1.5:1), decorative only | boundaries that matter use `border.control` (≥ 3:1) |

**Shipping it.** This CSS and the specimens' behaviour ship as the framework-agnostic `@weft-js/warp-core`. The CSS is
split per component, unchanged. The behaviour (sweep, floating label, dials, widget machines) is plain TS over the
DOM. `@weft-js/warp` is a thin weft binding that renders the specimen markup exactly. A binding for another framework
sits beside it on the same core (PLAN §6.1).

## 3. The expression dial

**Decision: three named stops, backed by a number.** `data-expression="quiet | balanced | vivid"` is what
components, agents and the config see: a closed enum fits weft's vocabulary rule, and three stops are what a
designer can actually review. Under it is `--warp-x` = 0, 0.5, 1, and every continuous token (radius, emphasis
weight, blur) is a formula of `x`, so `expression: 0.3` in the config works and needs no new design.
Discrete choices (font pairing, caps, the spring) snap to the nearest stop.

| | **quiet** (x = 0) | **balanced** (x = 0.5, default) | **vivid** (x = 1) |
|---|---|---|---|
| Source | the clean look, `old@main:theme/tokens.css:34-40` | a deliberate blend | the field look, `old:theme/tokens.css:29-33` |
| Body / display | Inter / Inter 600 | Inter / Space Grotesk 500 | Space Grotesk / Instrument Serif 400 |
| Eyebrow, badge | Inter 500, sentence case | IBM Plex Mono caps, +0.08em | Plex Mono caps, +0.14em |
| Buttons | Inter 500, sentence case; primary in neutral ink | Inter 500, sentence case; primary in accent | Plex Mono 600 caps, +0.1em (`old:theme/tokens.css:240-243`); primary in accent, two-colour fill, hard offset |
| Surfaces | shadow only, no hairline | hairline | hairline |
| Radius control / surface | 10 / 14px | 4 / 5px | 2 / 2px; chips and switches go square too |
| Emphasis line | 1px | 1.5px | 2px |
| Neutral temperature | slate, hue 255, C 0.011 | graphite, hue 80, C 0.005 | paper and ink, hue 85, C 0.012 |
| Accent / status chroma | × 0.8 / × 0.85 | × 1 / × 1 | × 1.2 / × 1.1 (capped at sRGB) |
| Depth | soft shadows at full strength | shadows × 0.7 | shadows × 0.35; borders carry the layering |
| Overlay backdrop blur | 12px | 6px | 0 (flat, opaque) |
| Motion | × 0.85, 4px travel, standard curve | × 1, 8px, expo-out | × 1.2, 12px, expo-out + spring pop |
| Stagger | 16ms | 32ms | 48ms |
| Sweep (signature, every stop) | 480ms; fields, controls, rails, buttons | 620ms; same | 700ms; + cards, panels, stat rows |
| Sweep stroke | full accent, 1px | full accent, 1.5px | full accent, 1.5px |

**Why balanced is the default.** Inter body text sits on any site; Space Grotesk headings and mono eyebrows keep
the family's voice; 5/7px corners read neither "bootstrap" nor "brutalist"; graphite neutrals take any brand
accent without a cast. It is the stop a stranger's marketing page and a dense admin both tolerate.

**Scope rules.** The attribute works on any element. A nested `data-expression` resets that subtree to its stop,
including the stop's sweep reach; `data-flair` on the same element widens (`sweep`) or narrows (`none`) it.

## 3b. The signature: sweep border and floating border field

Source of truth: [SIGNATURE.md](SIGNATURE.md). These two are warp's brand and run at **every** stop. The dial only
changes speed and reach, never whether they exist or how visible they are.

**The sweep border.** Two stacked borders. On hover or focus the accent border draws in left to right while the
resting border wipes away left to right at the same time; on leave the accent keeps travelling right and exits
(it never rewinds). 620ms `cubic-bezier(0.65,0,0.35,1)`, `clip-path: inset(… round <radius>)` on both layers
(`old:components/overlays/primitives/SweepBorderOverlay.tsx:31-61`, phases from `old:hooks/usePhaseSweep.ts:1-29`).
The resting border is ink-strength (`--text`), the stroke is the **full accent** (`old:components/inputs/text/FloatingBorderInput.tsx:20-58`).
Stroke vs resting border and stroke vs surface are both held ≥ 3:1 at every stop, light and dark, by the contrast
script, because a 1px dark-to-dark swap reads as nothing. Errors pin the stroke "in" and paint it critical.

**Where it runs.** Fields (and their leading icon), checkboxes, switches and every rail (slider fill, progress,
segmented indicator) and buttons at all stops; cards, panels and stat rows join at vivid.

- **Frame button** (`old:theme/tokens.css:317-493`, `old:components/buttons/core/Button.frame.tsx:1-54`): four
  10px/2px bracket corners in the track colour at rest, no border. On hover three things run together: tone
  corners clip in, an outline draws itself from the left middle over the top and under the bottom to meet at
  the right (the original's `dashoffset 1 → 0`, 2.6px; warp draws it in CSS with container units so it closes at
  any width), and a tone copy of the label wipes in. On leave it all
  keeps going right (`→ -1`). The filled variant slides a tone fill in from the left and out to the right.
- **Rails** (`old:components/inputs/choice/Switch.tsx`): the accent fill sweeps *through* the rail as the knob
  slides (620 / 420ms). Hover while on: an `accent-hover` layer sweeps through the inside. Hover while off: the ring
  sweeps around the rail. Slider fills and the segmented indicator use the same parts.

**The floating border field.** The label rests inside the field at its text size; on hover, focus or value it
rises into a notch in the top border (10px caps, 0.12em, semibold display face, 520ms `(0.16,1,0.3,1)`;
`old:components/inputs/text/FloatingBorderInput.tsx:73-111`). Hover counts. The notch is a pixel-aligned window on
whatever is behind the field, gradients included (`old:components/inputs/text/label-background.ts:64-82`). Each
letter takes the accent as the stroke passes it (delay = x ÷ sweep speed, `FloatingBorderInput.tsx:336-362`).
Floated at rest: accent + 40% black; active: the stroke's accent; error: critical.

**One switch for field style.** `warp({ fields: 'floating' | 'classic' })` writes `data-fields` on the root.
`classic` is a conventional field: label above as plain text, no float, no notch, no overlap. The sweep border and
icon sweep stay. A form (`<Form fields>`) or one field (`variant`) can override; nothing else changes. Native
date/time inputs always use the fixed-notch label in `floating`.

## 4. Type

- **Seven roles:** `display`, `title`, `heading`, `body` (+ `prose`), `label`, `eyebrow`, `caption`, `code`. One
  size, one leading, one weight and one tracking each per stop. That replaces 20 arbitrary sizes and ≥ 15
  trackings in the predecessor.
- **Floors:** 12px for sentence case, 11px for tracked caps. Nothing at 9–10px, with **one** exception: the floated
  field label (the signature's 10px caps in the notch). It is 10px on fine pointers and 11px on coarse ones
  (`label.float.size` = max(10px, 16px × 0.6875)), so on a phone it is no longer a 1.6× jump below the 16px value.
- **Steps by form factor** (desktop / tablet / phone): display 52/42/34, title 30/26/24, heading 20/19/18, body
  14/15/16, caption 12/12/13, code 13/13/14. Vivid multiplies display by 1.18 and title by ~1.14 because Instrument
  Serif has a small x-height.
- **Pairing logic.** Display carries personality, body carries reading. Body is never a serif or a display face.
  At vivid, use the serif's italic for a single emphasised word in a headline, never for whole lines.
- **No faux italics.** Space Grotesk ships no italic, and warp doesn't load Inter's for display use. Headings set
  `font-synthesis-style: none`, and `<em>` in a heading takes `text.emphasis.style`: upright in the accent colour at
  quiet and balanced, Instrument Serif's real italic at vivid. A browser-slanted roman is a craft defect.
- **Numerals:** tabular at every stop, through `text.numeric.font` + `text.numeric.variant`. Instrument Serif has no
  `tnum`, so at vivid a big static headline number may stay serif, but any figure that updates or aligns (live KPIs,
  deltas, timers, table columns) sets in the sans (`[data-numeric]`).

## 5. Colour

- **Neutrals do 90% of the work.** A 10-step ladder: page, surface, raised, overlay, sunken, hover, active, plus
  inverse. Light pages are calmer (neutral chroma × 0.45) than dark ones.
- **One accent.** The seed is a hue + chroma (default: the field green, hue 152). Everything accent (solid,
  hover, on-solid, soft, text, border, focus) derives from it per theme.
- **Four statuses + one optional highlight.** `positive` (148), `caution` (78), `critical` (27), `info` (252).
  `highlight` is the predecessor's lime "gold" (`old:theme/tokens.css:40`), renamed for what it is and never used
  for status.
- **Text is split from fill.** Every tone has `solid` (fills), `on-solid` (ink on fills), `soft` (tints) and `text`
  (tone-coloured words). That one split fixes the predecessor's 3.56:1 primary button and 1.53:1 gold fill.
- **Temperature per stop:** see §3. Status hues don't move with the dial, only their chroma does, so "red means
  failure" holds at every stop.
- **Data colours are their own palette** (§9). Charts never borrow status colours.

## 6. Iconography

- 24px grid, drawn at 16px (`icon.md`), 14 and 20 for sm/lg. Stroke 1.5, so it renders as the 1px hairline.
- Outline only. Fill marks state (a filled star = starred), never decoration.
- Caps and joins follow the dial: round at quiet and balanced, square/miter at vivid, which matches the 2px corners.
- An icon-only button needs an accessible name, and its hit area is ≥ `hit-min` even when the glyph is 14px.
- The house mark is warp threads crossed by a weft: four verticals, two horizontals in accent.

## 7. Illustration and empty states

- **Motif: the weave.** Fine vertical warp lines in `border-strong` with a few weft threads in accent, built from
  the same 1px lines as the UI (see the specimen hero). It scales from a 24px mark to a full-bleed header.
- **Empty states** use a small weave fragment (≤ 96px), a `heading`, one `body` sentence that says what will
  appear here, and one primary action. No characters, no 3D, no gradients.
- **Errors** use the same layout with a broken thread (one weft line stops short) and the critical tone on the
  line only.
- **Vivid** may use the serif italic in the empty-state heading. Quiet never does.

## 8. Motion

**What moves.** State changes (hover, press, check), arrivals and departures (overlays, toasts, rows), and
position changes the user caused (reorder, expand). Nothing moves on its own while idle, except status loops
(a skeleton shimmer, a spinner, a live dash). Under reduced motion `warp.base` stops every one of them: each
animation runs at most once, shimmers, skeletons, live dashes and anything marked `data-loop` stop, and spinners
become a slow opacity pulse. Loops that should hold their frame read `--warp-loop-play` (01 §2 Motion).

| Moment | Duration (balanced) | Curve | Travel |
|---|---|---|---|
| Hover, colour | `fast` 120ms | ease-out | none (colour and shadow only) |
| Press | `instant` 80ms | ease-out | 1px down (`old:theme/tokens.css:530-532`) |
| Menu, popover, toast | `base` 200ms | ease-out `(0.16,1,0.3,1)` (`old:motion/presets.ts:41`) | `motion.distance` 8px |
| Dialog, sheet, page | `slow` 320ms | ease-out; sheets in-out (`old:motion/presets.ts:155`) | sheets 100% of their edge |
| Scale accents (switch thumb, badge pop) | `base` | `ease-pop` (spring at vivid) | — |
| Sweep (all stops) | `sweep-duration` 480 / 620 / 700ms | in-out `(0.65,0,0.35,1)` (`old:theme/tokens.css:250`) | full width |
| Label float | 520ms | `(0.16,1,0.3,1)` | border to notch |

Durations scale by stop: × 0.85 / × 1 / × 1.2.

**Enter vs exit.** Exits are 50% of the enter duration, travel half the distance, accelerate (`ease-in`), and
**continue the direction of entry** rather than rewinding. Overlays anchored to a trigger leave toward it. This is
the sweep's rule too: in from the left, out to the right (`old:theme/tokens.css:274-285`).

**Stagger.** Only enters stagger. Delay = `stagger × min(index, 6)`, so the 7th row onwards arrives with the 6th
and a list never takes more than ~300ms to land. Exits leave together.

**The sweep (signature, every stop).** See §3b. Reach follows the stop; `data-flair="sweep"` adds buttons and
surfaces, `data-flair="none"` keeps it to fields and controls. Fields always sweep. It never runs on list rows or
nav items.

**Reduced motion.** `prefers-reduced-motion` or `data-motion="reduce"` sets `--warp-motion-scale: 0`. Travel,
scale and stagger become 0, durations shrink to 60%, the spring becomes plain ease-out. The sweep becomes an
instant border-colour change (same end state, no travel) and the label float a 120ms fade with no per-letter
stagger. Every state still has a visible change (colour, opacity, outline), so nothing is communicated only by motion.

## 9. Data visualisation

- **Categorical:** `color.data.1…8`, ordered for maximum adjacent difference (blue, amber, teal, magenta, cyan,
  red-orange, violet, olive). Each mark ≥ 3:1 against surface and page in both themes. Past 8 series, group into
  "other".
- **Sequential:** accent ramp from `accent.soft` to `accent.solid`. **Diverging:** `critical.text` ↔ neutral ↔
  `info.text`. Never use red–green as the only contrast.
- **Chrome:** gridlines `data-grid` (= hairline border), axis labels `data-axis` in caption size, tabular numerals,
  no chart borders, no 3D, no drop shadows on marks.
- **Marks:** bar ends get `radius.mark` on the value end only; lines 1.5px (2px at vivid); points ≥ 6px with a
  1px surface-coloured ring so overlaps read.
- **Motion:** data animates once on enter (`slow`, ease-out, bars grow from the baseline). Updates tween at
  `base`. Under reduced motion, values swap with a 120ms fade.
- Status colours belong to status. A chart of "failed vs passed" may use them; a chart of "regions" may not.

## 10. Do and don't

| Do | Don't |
|---|---|
| Put one solid button per view region; the rest soft, outline or ghost. | Two solid accents side by side. |
| Use `border.control` (≥ 3:1) on inputs, checkboxes and switch tracks. | Use the decorative hairline as an input's only boundary. |
| Use `text-faint` for meta (timestamps, counts); it is AA. | Signal disabled with faint ink; disabled is `opacity.disabled`. |
| Rest fields on a neutral fill; let the accent tint arrive with the sweep. | Tint every resting field with the brand accent. |
| Raise with `elevation-1` + hairline. | Stack `elevation-3` on a card inside a card. |
| Use mono caps for eyebrows and badges at balanced. | Use mono caps for body, field values or paragraphs. |
| Put the serif italic on one word of a vivid headline. | Set a whole vivid paragraph in Instrument Serif. |
| Keep the sweep on every field, at every stop, in full accent. | Dim the stroke to "calm" a stop; sweep nav items or rows. |
| Flip field style with `fields: 'classic'` once. | Fork the field markup per app. |
| Use `caution` for "needs attention", `critical` for "failed / destructive". | Use `highlight` (lime) for success. |
| Keep hover to colour and shadow. | Translate or scale cards on hover. |
| Let a nested `data-expression="quiet"` calm a dense table inside a vivid page. | Hand-tune radius or fonts per component. |
| Let the token build pick on-solid ink. | Hard-code `#fff` or `--page-bg` as text on a fill (the predecessor's 14 sites). |
| Give icon-only buttons an `aria-label` and a 44px hit area on touch. | Shrink tap targets to fit a toolbar. |
