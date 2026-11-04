# warp redesign: the loom

Status: 2026-10-31. Audit and evidence: [../../research/41-warp-audit.md](../../research/41-warp-audit.md). Keeps
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
no per-frame script. Used by Tabs, Segmented, Menu and the palette. Select has a plain highlight: `::picker` has no shuttle.

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

Tiers 0 to 3 are built.

**Deferred.** Palette height animation, HoverCard, Breadcrumbs, Stepper, the other stylesheets with no component, and the
rich inputs, which inherit tier 0 and need their own pass. Fonts: the kit should have an answer for the unconfigured
case, but that is a loading decision for the framework, not this pass.

## 5. Select, by construction

`Select` is warp's on every device: a `button[role=combobox]` and warp-core's `listbox()`, a popover or, on a phone, a sheet.
A hidden real `<select>` stays the form control and the `change` event, so no consumer changes, and with scripting off it is
what shows. `appearance: base-select` was tried first and dropped: it left Safari, Firefox and every touch device on the OS
popup, and the owner wants no browser-drawn control anywhere. `CompactSelect` is the same list for table rows and pagers,
with no `<option>` until it opens.

## 6. Size

warp's kit was 7.57 KB against the 7.00 KB allowance before this pass, and 9.22 KB once it added the custom Select. It was
6.36 KB after two changes of construction, then the scripted Select came back on purpose, and the allowance is now 11 KB
(`evals/warp-exit.mjs`). Measured with brotli 11, whole page with one component, runtime included: Select 15.04 KB against
10.63 KB for the base-select version, so **4.42 KB** more; Input 10.27 KB; CompactSelect 10.21 KB; NumberField 11.29 KB, 1.02 KB
over Input. The owner's rule is speed over bytes inside the 50 KB ceiling, and the shop stays well inside it. The panel is built
on first open and kept, so the bytes buy no mount work: a closed Select is a button and its hidden select.

- **The Select** is the 4.42 KB above. It replaced base-select, which saved 1.61 KB only by leaving most devices native.
- **The sweep** is one switch and two registered edges (SIGNATURE §1.4): 1.26 KB, the document `MutationObserver` and the
  hover tracking gone. An animation can't hand over to a transition in Blink (no transition starts on a property an animation
  was driving, even if the declared value changes too), so each edge has one job and its own transition instead.
- Motion is CSS: a token and a few rules each, inside files a component already loads. New components cost nothing unused.
