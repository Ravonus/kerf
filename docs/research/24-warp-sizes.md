# 24 — warp's per-component JavaScript: where the bytes go, and what came out

Research date: 2026-10-29. Status: **done; four of the targets met, four not (§4 says what each would cost)**.
Builds on warp tier 1 (PLAN §6.1). All sizes are brotli q11 of the minified production build, from
`node packages/warp/scripts/size.mjs` unless a row says otherwise. "Own" is a component's JS minus the 1,777 B
runtime row (weft rendering a `<div>` with one `state`). The CSS was not touched.

**The task.** Cut warp's per-component JS without changing what any component renders or does. Targets: simple
controls under ~1.5 KB own, inputs and overlays under ~3 KB, and the warp shop's JS back under 10 KB.

---

## 1. Where the bytes go

Each piece was measured by adding it to an entry one at a time. Brotli isn't additive, so these are increments in
build order:

| Piece | Adds (B br) | Who pulls it in |
|---|---|---|
| weft's attribute pass-through: `spread`, `mergeProps`, `omit` (a Proxy), and with them `className`, `style`, `ref` | ~1,090 | every component with `{...rest}` (Button, Toggle, Badge, Card, Field, Chip, Tag, Icon…) |
| `derived` + a conditional hole | ~70 | nearly all |
| `Icon` (8 inline icons) | ~360 | Button, Toggle, Chip, Field, Tag, Alert, Toaster (and, before this change, every overlay through Button) |
| the sweep phase machine (`installSweep`) | ~1,650 | Button, Toggle, Card, Chip, Field, Switch, Checkbox, Segmented |
| the field shell (`field`, `floatingLabel`, `labelChars`) | ~1,270 | Input, Search, Textarea, Select |
| `Field.tsx` and the control wrappers | ~1,490 | the same |
| Button's own code | ~670 | Button (and through it Popover, Alert, Modal, Drawer, Toaster before this change) |
| `popover` + the layer stack + `place` | ~1,050 | Popover |
| `dialog` | ~540 | Modal, Drawer |
| `toaster` + `toastStore` + `announce` | ~1,700 | Toaster |

So Button's 3,650 B was about 1.1 KB of weft pass-through, 1.65 KB of sweep machine, 0.36 KB of Icon and 0.67 KB of
Button. The ~1.15 KB a component really owns is shared with every other component on the page. The new page columns
(§3) make that visible.

**Overlays paid for Button.** Modal, Drawer, Alert and Toaster rendered their close/dismiss buttons with `<Button>`,
which statically imports the sweep machine, so each paid ~3 KB for one ghost button. A ghost button sweeps in CSS and
needs no JS.

**In the shop** (`evals/reference-v3/warp`, 11,129 B; the weft-only shop is 4,707 B), taking one piece out at a
time gives the ceiling for each:

| Taken out | Shop JS br | Saves |
|---|---|---|
| the sweep machine | 9,662 | 1,422 |
| the field shell | 9,748 | 1,336 |
| Icon | 10,747 | 337 |
| weft's pass-through (estimated: modules in the warp shop that the weft shop lacks) | — | ~580 |

---

## 2. What changed, and what each saved

Each candidate was measured alone. Those that saved nothing or grew are in §2.2.

### 2.1 Kept

| Change | Saves (own JS br) |
|---|---|
| **Overlay buttons as their markup.** Modal's and Drawer's Close, Alert's Dismiss, and Toaster's action and Dismiss render the ghost button's exact markup as a compiled template instead of `<Button>`. Each file now imports `button.css` itself, where Button's import used to be (`spinner.css` is gone, since these never load). | Modal −3,124, Drawer −3,140, Alert −2,005, Toaster −1,822 |
| **Notch alpha from the computed colour string.** `floatingLabel`'s notch read a colour's alpha by painting it on a 1×1 canvas. It now parses the serialization browsers give a computed colour: `rgba(…, a)` for sRGB, `… / a)` for every other space (`color()`, `oklch()`, `color-mix()` results). It rounds to 8 bits as the canvas did. Checked in Chromium against the canvas on 20 colours (named, hex, rgb/hsl/hwb, oklch, lab/lch, display-p3, three color-mix forms, the 0.99 boundary): the opaque-or-not answer is the same for all 20. | Input −50, Search −61, Textarea −63, Select −62 |
| **Button's frame anatomy as static spans.** The four-`<i>` `quad()` helper became literal markup inside the three corner spans. | Button −41, Popover −51 |
| **`Field` reads `rest` through one alias.** The compiler expands a rest parameter into a fresh `omit(props, [16 keys])` at every use, five times in Field. Field now reads it once, as `const live = untrack(() => rest)`; the Proxy reads stay live. | ~0 br (brotli already folded the repeats); four 16-key lists gone from the minified file |

Toaster's work budget also dropped from 13 reactive re-runs to 5 (`test/fixtures/interactions.tsx` tightened), since
the static buttons have no `derived` icon or loading wrappers.

### 2.2 Tried and dropped (measured, not kept)

| Candidate | Result | Why |
|---|---|---|
| Button loads the sweep with `import()` for soft/outline/frame (solid, ghost and link sweep in CSS) | Button 3,650 → **4,316** | Vite wraps every dynamic import in its preload helper (~550 B). In the shop, Card and Toggle import the sweep statically anyway, so the helper would be pure cost there. Lazy loading after hydration also moves bytes without removing them. |
| `Icon` as data (path strings, `<circle>` from numbers) | +218 | Dynamic attributes cost more than eight static templates |
| `Icon` with a shared `ring()` | +6 | Brotli already shares the repeats |
| One `probe()` shared by the sweep and the field shell | sweep +46, field −3 | Brotli punishes new distinct code more than it rewards dedupe |
| `AbortController` instead of paired `removeEventListener` | sweep +31, field −5 | Same reason |

The lesson: under brotli q11, repetition is nearly free. Only removing distinct logic shrinks a bundle.

---

## 3. Before and after

`size.mjs` now also prints two page views:
- **×10:** ten of the component on one page, own JS.
- **marginal:** what the component adds to a page that already renders all 24.
- An **"all 24 on one page"** row.

Ten Buttons cost what one does (3,617 vs 3,609), because the machine and helpers are shared per document.

| Component | Own before | Own after | Δ | ×10 after | Marginal before → after |
|---|---|---|---|---|---|
| Button | 3,650 | 3,609 | −41 | 3,617 | 5 → −7 |
| Toggle | 3,213 | 3,213 | 0 | 3,223 | 80 → 45 |
| Input | 5,950 | 5,900 | −50 | 5,895 | 74 → 4 |
| Search | 5,995 | 5,934 | −61 | 5,939 | 91 → 42 |
| Textarea | 5,997 | 5,934 | −63 | 5,938 | 118 → 47 |
| Select | 6,147 | 6,085 | −62 | 6,093 | 272 → 194 |
| Checkbox | 3,174 | 3,174 | 0 | 3,181 | 202 → 143 |
| Switch | 3,000 | 3,000 | 0 | 3,003 | 139 → 110 |
| Segmented | 4,238 | 4,238 | 0 | 4,238 | 232 → 195 |
| Tabs | 2,378 | 2,378 | 0 | 2,383 | 814 → 785 |
| Card | 2,959 | 2,959 | 0 | 2,959 | 218 → 188 |
| Badge | 1,244 | 1,244 | 0 | 1,254 | 131 → 137 |
| Tag | 1,802 | 1,802 | 0 | 1,787 | 119 → 98 |
| Chip | 3,269 | 3,269 | 0 | 3,281 | 139 → 70 |
| Kbd | 101 | 101 | 0 | 104 | 24 → 6 |
| Alert | 4,019 | **2,014** | −2,005 | 2,007 | 189 → 172 |
| Progress | 901 | 901 | 0 | 909 | 397 → 372 |
| Spinner | 393 | 393 | 0 | 398 | 87 → 46 |
| Skeleton | 560 | 560 | 0 | 562 | 190 → 156 |
| Tooltip | 1,649 | 1,649 | 0 | 1,710 | 480 → 455 |
| Popover | 4,973 | 4,922 | −51 | 4,927 | 412 → 412 |
| Modal | 4,750 | **1,626** | −3,124 | 1,640 | 145 → 99 |
| Drawer | 4,824 | **1,684** | −3,140 | 1,695 | 176 → 132 |
| Toaster | 5,957 | **4,135** | −1,822 | 4,147 | 1,613 → 1,593 |
| all 24 on one page | 14,152 | 14,076 | −76 | — | — |

Small marginals (and the one negative) are brotli noise of a few bytes.

**Shop:** JS 11,129 → **11,041 B br**. The kit's share went from 6,422 to 6,334 B; the CSS is unchanged at 15,991 B.
Overlays don't reach the shop's bundle, so most of the savings above don't show there.

---

## 4. The targets

| Target | Result | What reaching it would cost |
|---|---|---|
| Simple controls under ~1.5 KB own | **Badge 1,244 ✓**, Kbd, Spinner, Skeleton, Progress ✓. **Button 3,609, Toggle 3,213, Card 2,959 ✗** | Their own code is 0.1–0.7 KB. The rest is the sweep machine (1.65 KB) plus weft's pass-through (~1.1 KB), each paid once per page. Getting under 1.5 KB would need one of two things. One: load the sweep as its own chunk after hydration. That moves bytes rather than removing them, adds Vite's ~550 B preload helper to apps with no other lazy chunk, and can miss a hover that lands before the chunk does. Two: shrink weft's pass-through (§5.4), which is a weft change. |
| Inputs under ~3 KB | **✗ 5.9–6.1 KB** | Sweep 1.65 + field shell 1.27 + Field 1.5 + pass-through. Nothing left in them is dead code. Reaching 3 KB means dropping visible behaviour, such as the notch's window onto gradient and image backgrounds (~0.25 KB) or the per-letter tint delays. |
| Overlays under ~3 KB | **Modal 1,626 ✓, Drawer 1,684 ✓** (Alert 2,014). **Popover 4,922 ✗, Toaster 4,135 ✗** | Popover's trigger is the outline sweep Button (05 §3: it holds its sweep while open), and 3.6 KB of Popover is that Button. The popover itself is ~1.05 KB, so it only gets under 3 KB with a trigger that doesn't sweep. Toaster's action is 1.6 KB of spec behaviour (stacking, hover fan-out, timers on the hairline, swipe, F8, announcing), plus the tone icons and pass-through. |
| Shop JS under 10 KB | **✗ 11,041 B** (from 11,129) | It needs another ~1,040 B. All of weft's pass-through is ~580 B, so the rest would have to come out of the sweep machine or the field shell. Rewrites of both were byte-neutral (§2.2), so it can't be done without cutting behaviour. |

---

## 5. Guarantees, as checked

- **ui-core stays framework-free:** `test/agnostic.test.mjs` passes. The new code is a regex and string handling.
- **Markup and states unchanged:**
  - New `warp/test/markup.test.tsx` covers every markup branch in `fixtures/Variants.tsx`: every Button emphasis, icon and loading state, every Icon, the Toggles, field variants, choices, surfaces, alerts at all six tones, tabs, overlays open and closed, and toasts.
  - It snapshots the server HTML and the client DOM once actions have attached. Attributes are sorted; weft's hole markers and `wk` keys are dropped.
  - The snapshots were written from the original sources, and the new code matches them.
- **The sweep and field shell are pinned by behaviour too:**
  - New `ui-core/test/trace.test.ts` runs one scripted session for each, on fake timers.
  - The sweep session covers 12 host kinds: hover, leave, backstop, transitionend, re-hover while out, held states, trigger labels, field focus and `data-open`, touch, confirm, pin, static hosts, hosts added later, and the duration cache per expression stop.
  - The field session covers delays, notch colour and the gradient window, the counter, clear, filled, select, press-to-focus, update and destroy.
  - These snapshots were also written from the original sources.
- **Expression dial stops:** components don't branch on the dial in JS. The dial only feeds the sweep's measured durations, which the trace covers with a vivid scope.
- **Work budgets:** none got worse; Toast's re-runs went from 13 to 5.
- **SSR + hydration:** 0 misses and 0 writes for all 25 cases.
- **Shop:** 23/23 hidden tests. Add-one is 2 DOM mutations and price-push 1, both unchanged.
- **axe:** the shop has 0 violations over 24 audits (3 stops × 2 themes × 2 motion settings). The spec gallery shows only the known spec finding: the pressed-chip count at 3.23:1 in light mode.
- **Suites:** ui-core 20, warp 74, weft 219, CLI 89, cargo (weft-compiler 86, weft-layout 7), all passing.

## 6. Findings for later (not fixed here)

1. **weft compiler panic.** A `.tsx` module with an `import` after a statement panics in `src/srcmap.rs:16` ("byte range starts at N but ends at M") and takes the build down.
2. **W001 false positive.** It fires on `const x = rest`, but a rest parameter is a live proxy. `untrack(() => rest)` works around it.
3. **Rest parameters are expanded at each use.** Each `rest.x` becomes its own `omit(props, [...])`. That's brotli-neutral but wasteful in raw bytes and allocations.
4. **weft's pass-through is the biggest shared cost after the sweep** (~0.6–1.1 KB br). A compiler path could bind the attributes it knows directly and spread only the rest, with a cheaper `omit` than a Proxy. That would help every weft app, not just warp.
5. **`sweep.pin(el, false)` loses its own backstop timer.** The observer re-steps the host and clears the timer, so the host leaves "out" only on `transitionend`. That's fine in a browser, but a host whose part never transitions stays "out". Kept as is, since behaviour was frozen for this pass.
