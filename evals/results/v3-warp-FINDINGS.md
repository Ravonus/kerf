# v3 on weft + warp: Phase 2 exit check (2026-10-29)

PLAN §9, row 2: *"The v3 shop app rebuilt on weft + warp passes its hidden tests within the §3.7 budget plus a
measured kit allowance; contrast and a11y suites green at every dial stop."*

**Verdict: met.**
- **Hidden tests:** 23/23. The §3.7 work budgets hold.
- **Size:** inside §3.7 plus a 7 KB kit allowance.
- **Contrast and a11y:** green at all 12 dial stops, on every warp component and on the shop.
- **Spec findings:** two contrast failures were in the spec's own CSS. The user approved the spec review's fix on
  2026-10-30 (drop the opacity); both now pass and the gate has no exemptions.

Rerun with `node evals/warp-exit.mjs` (≈ 3 min). It writes `results/v3-warp-exit/exit.{json,md}` and exits 1 if any
part fails.

## Hidden tests and work budgets

`run-app.mjs reference` → `grade` → `measure` on `reference-v3/warp` and `reference-v3/weft`. Both use the same
hidden tests (23) and the same 150-row probe.

| | baseline | t1 | t2 | t3 | price-push | add-one | type 3 chars |
|---|---|---|---|---|---|---|---|
| weft + warp | 4/4 | 5/5 | 7/7 | 7/7 | 1 DOM · 9 re-runs | 2 DOM · 5 re-runs | 158 DOM · 33 re-runs |
| weft | 4/4 | 5/5 | 7/7 | 7/7 | 1 DOM · 9 re-runs | 1 DOM · 5 re-runs | 152 DOM · 21 re-runs |

§3.7 limits: price-push ≤ 1 mutation and ≤ 10 re-runs, add-one ≤ 3 mutations. All pass.
- The warp adapter (`frameworks/warp/adapter.tsx`) didn't count re-runs before. It now reports weft's `stats.runs`,
  the same as the weft adapter, so the re-run budget is measured for warp too.
- Add-one's second DOM write is the kit: the stock Badge re-renders.

## Size and the kit allowance

Both shops are built for production and measured with brotli q11.

| | JS | CSS |
|---|---|---|
| weft shop | 4,710 B | — |
| weft + warp shop | 10,990 B | 15,991 B |
| kit (warp − weft) | 6,280 B | 15,991 B |

- **The kit allowance is 7 KB of JS.** That is the measured kit (6.1–6.4 KB across this run and the warp tier 1 run),
  rounded up so that a byte-level change doesn't flip the gate. A larger jump should be looked at, not absorbed.
- **What the kit pays for:**
  - the field shell (floating label, notch);
  - the sweep machine;
  - Button, Toggle, Select, Badge and Skeleton;
  - weft's spread helpers.
- **Not in the bundle** (tree-shaken out, per the tier 1 hand-over): overlays, toasts and the dial code.
- **Gates:**
  - JS ≤ §3.7's 10 KB + 7 KB = 17 KB. Pass at 10.73 KB.
  - The weft shop alone ≤ 10 KB. Pass at 4.60 KB.
  - JS + CSS ≤ the 50 KB ceiling. Pass at 26.3 KB.
- **CSS:** §3.7 has no CSS budget. Most of the CSS is warp.css's tokens and signature, which every warp page pays
  once.

## Contrast on the resolved tokens

`packages/ui-core/scripts/contrast-check.mjs` checks `ui-core/styles/warp.css`. The script is the spec checker,
unchanged (a test keeps it equal). It resolves every sys colour at light/dark × quiet/balanced/vivid and checks each
text/fill, UI and focus pair against WCAG 2.x.
- **Result:** 858 checks (143 pairs × 6), 0 failures.
- **Tightest pairs** are 4.52–4.63:1, for example text-faint on surface-sunken (light/quiet) and positive-text on its
  tinted soft (dark).
- **Motion:** it only sets `--warp-motion-scale` and `--warp-loop-play` and changes no colour, so the token check has
  no motion axis. The page suite below covers both motion settings.

## a11y at every dial stop

`packages/warp/scripts/a11y.mjs` runs in Chromium (playwright-core) at 12 stops: expression quiet/balanced/vivid ×
theme light/dark × motion full/reduce. The dials are set on `<html>` before any script runs, and the emulated media
match them.

**Sites:**
- **gallery** (`packages/warp/test/a11y`): every branch in `test/fixtures/Variants.tsx`, plus Kbd, Spinner and
  Tooltip, which Variants doesn't render. It is audited in 6 states:
  - static;
  - tooltip shown;
  - field focused;
  - modal and drawer open;
  - popover open;
  - three toasts.
- **shop:** the production build, audited in 2 states: the product list, and the cart after adding an item.

**Checks:**
1. **axe-core**, with WCAG 2.0–2.2 A/AA rules and best practices. `color-contrast` is included.
2. **Measured contrast for what axe can't decide.** warp's sweep parts and pseudo-element fills make axe return
   "incomplete" (background not determined) on most controls. For each of those nodes the suite:
   - resolves the text colour through a canvas, so oklch and color-mix are handled, multiplied by every ancestor's
     opacity;
   - screenshots the text box with the text made transparent;
   - checks the text colour against every background covering ≥ 10% of the box, and keeps the worst ratio;
   - skips text covered by a top-layer overlay.

   1,042 nodes were measured this way.
3. **Motion at reduce.** No loop may animate anything but opacity (00 §8: every animation runs at most once, and
   spinners and indeterminate bars become an opacity pulse).

**One WCAG exemption is applied.** Text inside a disabled control is not contrast-checked. 03 §2 dims a disabled
field to 50% as a whole, including its message, and WCAG 1.4.3 exempts "part of an inactive user interface
component". axe applies that exemption only to the control's own text.

**Result:**
- 24 runs and 96 audits.
- 0 axe violations, 0 measured failures (after the spec fix below), and 0 motion leaks.
- 0 page errors.

### What the suite found, and what was done

| Found | Cause | Done |
|---|---|---|
| `aria-valid-attr-value` on Variants' submit button | the fixture passes `aria-controls="x"` to show passthrough, and no `#x` existed | the gallery adds the target. Not a component bug |
| `html-has-lang` on the shop | the warp starter's `index.html` had no `lang` | `lang="en"` added to `tasks-v3/shop/starter/warp/index.html` |
| Error text 2.1–2.8:1 in the gallery's "Code" field | that field is disabled, and the spec dims it all to 50% | WCAG exemption (above) |
| Spinners and indeterminate progress still animating at reduce | warp.base's spec'd `warp-pulse`, which is opacity only | allowed: the check fails loops that move, not opacity pulses |
| **Pressed Chip count, 3.19–3.25:1** | spec CSS, inputs `choice.css`: accent text at `opacity: .7` on accent-soft, 12px | **spec finding 1**, fixed in the spec (opacity dropped) |
| **Segmented count, 4.0–4.11:1** | spec CSS, inputs `choice.css`: text-subtle at `opacity: .8`, 11px | **spec finding 2**, fixed in the spec (opacity dropped) |

## Spec findings (fixed in the spec, 2026-10-30)

Both failures are in light theme only, at every expression and both motion settings. Dark passes: 5.0–5.2:1 for the
segmented count. Both come from an `opacity` dimming small text that already uses a passing token:

1. **`[data-scope="chip"] [data-part="count"] { opacity: 0.7 }`** gives 3.2:1 on a pressed chip. The warp tier 1
   session found it first, on the spec gallery: 3.18–3.23:1.
2. **`[data-scope="segmented"] [data-part="count"] { opacity: 0.8 }`** gives 4.0–4.1:1 on the track. This one is new.

The spec's own a11y review already names this class: reviews/03 m12, "Small text under 4.5:1 … subtle or text
tokens". Following it means dropping the two opacities, which leaves text-subtle at 6.6:1 and the accent text at
about 6:1. That edits `docs/design/warp/tokens/warp-inputs.css` and re-splits `ui-core/styles` (`split-css.mjs`
keeps them verbatim). The user approved it on 2026-10-30: both opacities are gone (with a `review 03 m12` comment,
as on Pill), `ui-core/styles` is re-split, `SPEC_FINDINGS` is empty, and the rerun is 0 failures over 1,024 measured
contrasts.

## Files

- `evals/warp-exit.mjs`: the exit check, in four parts (hidden, size, contrast, a11y).
- `packages/warp/scripts/a11y.mjs`: the a11y suite. It also runs standalone: `npm run a11y` in packages/warp, which
  covers the gallery; add `shop=<dist>` for a built app.
- `packages/warp/test/a11y/`: the gallery page.
- `evals/frameworks/warp/adapter.tsx`: counts re-runs.
- `evals/tasks-v3/shop/starter/warp/index.html`: `lang="en"`.
- `results/v3-warp-exit/`: grades, probe, `exit.json`, `exit.md`.
