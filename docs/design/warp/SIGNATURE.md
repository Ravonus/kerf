# warp signature: the sweep (non-negotiable)

The user's words: the original inputs, and the sweep above all, are **the part of the old design to keep**. Every warp
designer builds on this. It isn't an option, and it isn't vivid-only. The dial changes speed and how much a click target answers,
never whether inputs and controls sweep, and never makes the stroke faint.

The source is read-only in `~/dev/agorix-discord/packages/ui/src`:
- `components/inputs/text/FloatingBorderInput.tsx`
- `components/overlays/primitives/SweepBorderOverlay.tsx`
- `hooks/usePhaseSweep.ts`
- `components/inputs/primitives/FloatingBorderIcon.tsx`
- `components/inputs/choice/FloatingBorderCheckbox.tsx`
- `components/buttons/core/Button.styles.ts` (`btn-border-sweep`)
- `components/inputs/text/label-background.ts`

**The original showcase:** `~/dev/agorix-discord/packages/ui/sandbox`, a Vite app with pages under
`sandbox/src/pages/{foundations,forms,display,feedback,layout-nav,motion,recipes,setup}`.
- Read its pages to see how each component was actually presented and combined.
- When it's running, it's at http://localhost:5174. warp's specimens should be at least as rich as it.

## 1. The sweep border

1. **Two stacked 1px borders.** A resting **base** border sits underneath an accent **sweep** border.
2. **In (hover or focus):** the sweep border draws in **left to right**, going from `clip-path: inset(0 100% 0 0)` to
   `inset(0)`. At the same moment the base border wipes away left to right, from `inset(0)` to `inset(0 0 0 100%)`.
3. **Out:** the sweep border **keeps travelling left to right**. It clips away from the left, `inset(0)` →
   `inset(0 0 0 100%)`, while the base border snaps back underneath. It never reverses.
4. **One switch, two edges (redesign.md §6).** `--_a` is 1 while a host is hovered, focused or held, and two registered
   edges (`--_sl`, `--_sr`) draw from it: active, the right edge draws across; inactive, the left edge follows it out and the
   right resets out of sight once that has finished. So a stroke can't reverse, and leaving part way only ends it sooner.
   Re-entering during an exit shows the stroke whole at once, where the phase machine restarted it from the left: neither
   runs backwards. Hover and focus are the browser's, so the sweep runs with no script and writes nothing to the DOM.
5. **Timing:** 620 ms, `cubic-bezier(0.65, 0, 0.35, 1)`. The clip-path corners use `round` to match the host's corner
   radius.
   Phase **in** runs on `--warp-sweep-ease-in`, front-loaded so the stroke leaves at once (redesign.md §2); phase **out**
   keeps this curve. To revert, set that token to `--warp-sweep-ease`.
6. **Errors:** the sweep is pinned in, painted `--danger`.
7. **Where it's used:** across the whole kit, including:
   - text inputs, checkbox, combobox, select, the date pickers
   - buttons (`btn-border-sweep`, plus a filled variant)
   - cards, panels, chips, pills, segmented controls, accordion, stat rows, skeleton
   - the generic `SweepBorderOverlay`, for any custom surface

## 1b. The frame button (`btn-border-sweep`): match it exactly

Source: `buttons/core/Button.frame.tsx` and `theme/tokens.css:228-480`.

1. **At rest:** four **bracket corners**.
   - Each corner is an L shape 10px long, with a 2px stroke, in the track colour (text at 62%; `#050505` in light).
   - There is no full border at rest.
2. **On hover or focus, three things run together:**
   - **The active corners** (in the tone colour) sweep left to right over the base corners, using `clip-path`.
   - **An outline draws itself around the frame.**
     - The original is two SVG paths in a 100×100 viewBox with `preserveAspectRatio="none"`. Path A,
       `M 1 50 V 1 H 99 V 50`, goes up from the left middle, across the top, and down to the right middle. Path B,
       `M 1 50 V 99 H 99 V 50`, does the same along the bottom. Both draw at once (`stroke-dashoffset: 1 → 0`,
       `pathLength=1`, `vector-effect: non-scaling-stroke`, 2.6 stroke, square caps).
     - warp draws the same two routes in **CSS**, not SVG: six 2.6px segments
       (`<span data-part="sweep-outline"><i></i>×6</span>`) size themselves from two registered numbers,
       `--warp-frame-head` and `--warp-frame-tail` (0 → 1), with container units. In Chrome an SVG dash with
       `pathLength` + `non-scaling-stroke` is measured in screen px and leaves gaps past ~200px wide; the CSS
       segments are exact at any size. There is one implementation, in `tokens/warp.css` (`warp.signature` §1b);
       pages supply only the button's fill, ink and shape.
     - The two strokes travel from the left edge and meet at the right edge.
   - **The content sweeps:** the resting label is in the tone colour (the original's `.btn-idle-accent`), and a second
     copy of the label in the **text** colour wipes in over it, left to right, with `clip-path`.
3. **On leave:** the outline **keeps travelling** (its tail follows its head, the original's `dashoffset: 0 → -1`),
   so it exits through the right side. The corners and content clip out to the right.
4. **Timing: 620 ms**, `cubic-bezier(0.65,0,0.35,1)`: the field sweep's own clock, so every stroke draws at one speed (the
   original's `--btn-sweep-duration` ran 760 ms). Token `--warp-frame-duration` (quiet 480 ms, balanced 620 ms, vivid 700 ms;
   0 under reduced motion).
   The frame host runs every part on it.
5. **Filled variant** (`btn-border-sweep-filled`): a tone fill slides in from the left (`translateX(-101%) → 0`) and
   leaves to the right (`→ 101%`).
6. **Touch:** a tap shows the full "in" state briefly (`data-touch-effect`).
7. **Corners:** square-capped and mitred, never rounder than 2px (`min(--warp-radius-mark, 2px)`).

## 1c. The switch rail: the fill moves through the rail

Source: `inputs/choice/Switch.tsx`.

- **The rail itself sweeps.** Turning the switch on sweeps an accent **fill through the rail** from left to right
  (`clip-path: inset(0 100% 0 0) → inset(0)`, 620 ms), while the knob slides across (420 ms, same easing) and turns
  white.
- Turning it off clips the fill back.
- **Hover or focus while off:** an accent ring sweeps around the rail's border, entering and leaving left to right.
- **Hover or focus while on:** a brighter `accent-hover` layer sweeps **through the inside of the rail** from left to
  right.
- Do the same for any rail-like control: slider and range tracks (the filled portion sweeps), progress bars, and the
  segmented control's indicator.

## 2. The floating border label

1. **At rest:** the label sits inside the field, at the field's own text size.
2. **Floated:** on **hover, focus or value**, the label rises into a notch in the top border.
   - Style: 10px, uppercase, 0.12em tracking, semibold, display face.
   - Transition: 520 ms `cubic-bezier(0.16, 1, 0.3, 1)`.
   - Hover counts, so the label lifts as the pointer arrives. That's part of the feel.
3. **The notch background matches whatever is behind the field, gradients and images included.** A pixel-aligned window
   onto the ancestor's background is computed, so there's no flat colour patch. `labelBackground` overrides it.
4. **Label colour travels with the sweep, one character at a time.** Each character's colour transition is delayed by
   its x-position divided by the sweep speed.
   - Resting floated label: accent mixed with 40% black.
   - Active label: full accent.
   - Error: danger.
   - The real label stays the accessible name: a visually hidden `label-text` copy (no text-transform) beside
     `aria-hidden` per-character spans whose letters are generated content (`01-foundations.md` §2, Label anatomy).
     Never `aria-label` on the input, never `aria-hidden` on the `<label>`.
5. **The field style is a toggle the user asked for: the signature floating field, or a classic field.**
   - **`floating`** (the default) is the signature. The label sits inside the field and rises **over the border** into
     the notch on hover, focus or value.
   - **`classic`** is a traditional input. The label sits above the box as normal text, with no float, no notch and no
     overlap. The placeholder sits inside, and hint and error go below. It's for apps that want conventional forms.
   - Set it once for the whole app with `warp({ fields: 'floating' | 'classic' })`, which writes `data-fields` on the
     root and flips every field with no code changes. Override it with `<Form fields>` or a per-field `variant`.
   - The sweep border stays in both styles, because it's the brand. `classic` keeps the sweep border and the icon
     sweep, and the label simply doesn't move.
   - Both styles share the same markup and accessibility (a real `<label for>`). Only CSS changes between them.
   - Native date and time inputs, which always show a value template, use a fixed notch label in `floating` mode.
6. **Icons sweep too.** The leading icon is painted in accent. `FloatingBorderIcon` runs the same clip sweep, driven by
   the field's active state.
7. **Messages:** hint and error text slide in (180 ms) under the field.

**Surfaces exception (decided 2026-10-28).** Cards, panels, stat tiles and kanban cards rest on the thin hairline
border (`--warp-color-surface-line`), which keeps the streamlined look; at quiet they rest on shadow alone, with no
line. Inputs and controls rest on the ink border; segmented groups and switches rest on the hairline, ink for focus. Over a hairline, the full-accent
sweep stands out by hue even where the luminance ratio is 1.5–3:1, so surfaces only need sweep-vs-surface ≥ 3:1.
Sweep-vs-base ≥ 3:1 stays mandatory for fields and controls, which is where it was invisible.

## 3. How the dial applies

| | quiet | balanced (default) | vivid |
|---|---|---|---|
| Sweep | present everywhere it's used | present, the original | present, the original |
| Sweep colour | full accent (only faster) | full accent | full accent, richer contrast |
| Sweep speed | about 480 ms | 620 ms | 620–760 ms |
| Floating label + notch | yes | yes | yes |
| Per-character label tint | yes (subtle by colour) | yes | yes |
| Icon sweep | yes | yes | yes |
| Surfaces that sweep by default | inputs and controls | inputs, controls, buttons | the same, plus the two-colour button fill. Static cards and panels never sweep; a card you can press does, at every stop |

**Reduced motion:**
- The sweep becomes an instant border-colour change.
- The label float becomes a 120 ms fade, with no movement and no per-character stagger.
- The resulting states are identical to the animated version.

## 4. In weft

- The sweep is CSS: `--_a` plus two registered edges (§1.4). `installSweep()` keeps only `confirm()`, `pin()` and `duration()`.
- A tap draws one whole sweep, then exits. `:active` ends too soon to do that, so each part keeps its `--_a` for 1.25 sweeps past it: still no script.
- A held sweep never stacks two copies of its text: the resting label wipes away ahead of the copy and returns the moment the host lets go.
- The per-character delays come from one layout read after mount, re-read on resize.
- The notch window is a `derived` value that reads the layout once.
- The markup is `data-sweep` on the host, `data-part="sweep"` and `data-part="sweep-base"` inside it. `floatingLabel()` does the
  label.
- `specimens/warp-sweep.js` is the historical phase machine that the specimens still run. warp no longer ships one.
- **`--_on` is reserved.** It is the sweep switch, a number (0/1) the signature layer multiplies into opacity and
  clip. Components must name tone colours differently (`--_tone`, `--_solid`); a colour in `--_on` kills the sweep.
- `--warp-color-sweep-base: inherit` on a host restores the ink resting border after a component recolours it.
