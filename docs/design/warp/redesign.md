# warp redesign: the loom

Status: 2026-10-31. Audit and evidence: [../../research/39-warp-audit.md](../../research/39-warp-audit.md). Keeps
[SIGNATURE.md](SIGNATURE.md); where this changes it, it says so.

## 1. What warp is

A shadcn clone is a pile of quiet boxes. warp is **a loom**: thin threads under tension, and one shuttle that carries
colour across them. Every decision comes from that picture.

| On a loom | In warp | Rule |
|---|---|---|
| Warp thread | the hairline | Chrome is thin. It is the only ornament |
| Weft | the sweep | Crosses left to right, in accent, never rewinds. Untouched |
| **Shuttle** | the one moving highlight in a group | One per group. It never fades between items: it travels |
| **Tension** | press and release | A press takes up slack at once. Release settles on a spring |
| **Pick** | a single pass of weft | One line drawn across a surface as it arrives, then gone |
| Selvedge | the finished edge | Focus, selected rows and the open panel's edge are drawn, not switched on |

The dither belongs to `claude/warp-dither` and is the loom's cloth at a distance. This pass adds no texture.

## 2. Two clocks

The audit's main finding is that the first 150 ms is empty. So warp runs two clocks, and every interaction uses both.

- **The touch clock answers the hand.** 0–120 ms, front-loaded. Hover colour is instant in and fades out over 160 ms.
  Press is instant. This is what makes it feel wired to the pointer.
- **The thread clock is the grace note.** The sweep and the frame, 480–760 ms. Decorative, never awaited, never blocks.

No hover ever waits on the thread clock again.

**One change to SIGNATURE.** The sweep keeps its durations, its direction and its out curve. Its *in* curve is now
front-loaded (`--warp-sweep-ease-in`), so the stroke leaves at once and eases into the far edge. In-out spends its first
100 ms barely moving, which is the emptiness above. Set the token back to `--warp-sweep-ease` to revert.

## 3. The motion system

One curve set, on transitions, so everything can be interrupted and retargeted.

| Token | quiet | balanced | vivid | Used for |
|---|---|---|---|---|
| `--warp-ease-spring` | no overshoot | bounce ≈ .12 | bounce ≈ .28 | release, arrivals |
| `--warp-spring-duration` | 240 ms | 380 ms | 520 ms | same |
| `--warp-press` | .985 | .97 | ink offset | pressed scale |
| `--warp-touch-out` | 120 ms | 160 ms | 200 ms | hover fade out |
| `--warp-shuttle-head` / `-tail` | 180 / 180 | 180 / 300 | 150 / 420 | the shuttle's two edges |
| stagger | 0 | 32 ms | 48 ms | panel contents, once |
| `--warp-ease-sheet` | Vaul's `(.32,.72,0,1)` at every stop | | | drawers |

Rules:

1. **Exits are half the enter and travel less.** Up from 70%: the eye has already left.
2. **Never scale from 0.** From `--warp-motion-scale-from` plus a few px, from the trigger (`--warp-origin`, written by
   `place()`).
3. **Frequent means fast.** Anything keyboard-repeated (list highlight) stays under 140 ms and never overshoots.
4. **Reduced motion** goes through the existing scale token: distance, stagger and press go to nothing, the state changes
   are identical.
5. **Budget.** Nothing idles. Everything over 384 ms is a spring settling or the thread clock.

### The dial must read in the hands

Today quiet and balanced differ in colour and shape. After this they differ in physics.

- **quiet** is well-oiled. No overshoot, no stretch, no stagger. Almost invisible, and very fast.
- **balanced** has tension. The shuttle stretches a little, release settles once.
- **vivid** is a machine. The shuttle stretches hard, springs overshoot, and buttons rest on a hard ink offset they press
  into, because vivid has no soft shadows to lift with.

### The shuttle

Two registered numbers, one per edge, on separate timings. Moving right, the leading edge goes first and the trailing
edge follows, so the highlight pulls out like a thread and snaps back to width. It costs one attribute (`data-dir`) and
no per-frame script. Used by Tabs, Segmented, Select, Menu and the palette.

### Pick and selvedge

- **Pick.** A dialog draws one accent hairline across its top edge as it opens, then it fades. One pass, no loop.
- **Focus ring.** Grows from the edge to its 2 px offset in 120 ms. None of the kits checked animates this.

## 4. What gets redone, in order

**Tier 0: foundation.** Motion tokens, press, hover clocks, focus ring, `--warp-origin`, shuttle CSS and logic. Costs
almost nothing per component, and raises everything built on `data-scope="button"` and `data-sweep`.

**Tier 1: the first ten clicks of a demo.**

1. Button: two clocks, tension, a visible spinner, the vivid offset.
2. Select: custom. See §5.
3. Tabs and Segmented: the shuttle; fix the stretch.
4. Dialog: origin, pick, staggered contents, faster exit.
5. Toast: Sonner-grade stack, retargetable, `toast.promise`.
6. Tooltip and Popover: origin and scale.
7. Menu: new. Icons, kbd, groups, tones, the shuttle.
8. Card: real hierarchy.
9. Table: caption, row states, a selvedge on selected rows.
10. Field: neutral at rest in vivid; the notch and sweep stay.

**Tier 2: added, because the audit says they matter.**

Number roll (`Ticker`), Accordion, Radio, Slider.

**Tier 3: fixes.** Nav layout, Chip and Toggle alignment, Alert's weight.

**Deferred.** Palette height animation, HoverCard, Breadcrumbs, Stepper, the other stylesheets with no component, and the
rich inputs, which inherit tier 0 and need their own pass. Fonts: the kit should have an answer for the unconfigured
case, but that is a loading decision for the framework, not this pass.

## 5. Select, by construction

`Select` stays a real `<select>`. It is the form control, the accessible name and the `change` event, so no consumer
changes, forms and tests keep working, and without JavaScript it still works. On fine pointers a small action takes over
the open: it cancels the native popup and shows warp's listbox in the top layer, driven from the same element. On coarse
pointers the OS sheet stays, as 03 §4 already says. All inputs look custom where a pointer can see them, and the kit
gains under 1 KB instead of a second control.

## 6. Size

warp's kit is at 7.61 KB against the 7.00 KB allowance. No gates. The fix is construction.

- Motion is CSS: a token and a few rules each, inside files a component already loads.
- New components live in their own files and cost nothing unused.
- `ui-core` adds small actions only: shared `place()` origin, shuttle, select.
- The sweep machine's document-wide `MutationObserver` and hover tracking are the largest kit cost. A pure-CSS hover sweep
  looks feasible (animation in, transition out) and would remove most of it, but it touches 30 stylesheets and the
  `data-phase` contract. Prototype it separately.
