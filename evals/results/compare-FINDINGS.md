# Stack comparison (2026-10-30)

From `evals/compare` (see its README; raw numbers in `results.json`, charts in `compare.html`). One screen, a shell and a 200-row
table, one data set, latest stable versions, plain `vite build`. The same nine-step script passed on all six. Timing is headless
Chromium under 4x CPU throttle, median of five, at load ~5.

The first four stacks ship one stylesheet, `shared/design.css`, and render the same page. Compare frameworks there. warp and MUI
bring a design system, so compare them as kits.

| | weft, no warp | Solid + Kobalte | React + Radix | React + Zustand | weft + warp | React + MUI |
|---|---:|---:|---:|---:|---:|---:|
| JS br | 5.3 KB | 47.4 KB | 98.3 KB | 98.4 KB | 20.8 KB | 239.6 KB |
| CSS br | 1.4 KB | 1.4 KB | 1.4 KB | 1.4 KB | 19.5 KB | in the JS |
| **JS + CSS br** | **6.6 KB** | **48.8 KB** | **99.7 KB** | **99.8 KB** | **40.3 KB** | **239.6 KB** |
| JS raw (what the CPU parses) | 15 KB | 175 KB | 369 KB | 370 KB | 75 KB | 974 KB |
| Script on load | 35 ms | 77 ms | 113 ms | 117 ms | 64 ms | 324 ms |
| Style on load | 4 ms | 4 ms | 3 ms | 3 ms | 28 ms | 12 ms |
| Layout on load | 18 ms | 20 ms | 18 ms | 19 ms | 30 ms | 47 ms |
| All main-thread work on load | 104 ms | 150 ms | 177 ms | 184 ms | 176 ms | 430 ms |
| First contentful paint | 84 ms | 132 ms | 164 ms | 184 ms | 152 ms | 420 ms |
| JS heap | 2.2 MB | 3.8 MB | 4.4 MB | 4.4 MB | 3.1 MB | 10.9 MB |
| DOM nodes (CDP) | 678 | 617 | 508 | 508 | 1479 | 765 |
| App source lines | 120 | 118 | 129 | 137 | 44 | 90 |

DOM mutations per interaction:

| | weft, no warp | Solid + Kobalte | React + Radix | React + Zustand | weft + warp | React + MUI |
|---|---:|---:|---:|---:|---:|---:|
| Live cell | 3 | 40 | 3 | 3 | 3 | 131 |
| Sort | 37 | 46 | 60 | 60 | 37 | 57 |
| Next page | 43 | 43 | 65 | 65 | 43 | 68 |
| Filter | 42 | 46 | 73 | 73 | 57 | 132 |
| Select row | 2 | 6 | 7 | 7 | 6 | 171 |
| Details open | 3 | 3 | 5 | 5 | 19 | 148 |
| Column picker | 22 | 55 | 54 | 54 | 11 | 305 |
| Account menu | 0 | 25 | 26 | 26 | 5 | 147 |

JS + CSS br as the app grows (each screen has its own columns, words, state and markup):

| Screens | weft, no warp | Solid + Kobalte | React + Radix | React + Zustand | weft + warp | React + MUI |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 7.0 KB | 49.1 KB | 100.0 KB | 100.2 KB | 40.7 KB | 240.0 KB |
| 10 | 8.8 KB | 50.8 KB | 101.6 KB | 101.7 KB | 42.5 KB | 241.6 KB |
| 50 | 13.8 KB | 55.9 KB | 105.9 KB | 106.1 KB | 47.8 KB | 246.1 KB |
| 200 | 27.1 KB | 68.7 KB | 117.0 KB | 117.3 KB | 61.6 KB | 258.4 KB |

## Reading it

- With the CSS equal, weft leads on every load measure and on every timed step here: 6.6 KB, 84 ms first paint, Solid 48.8 KB and 132 ms.
- That size gap is not only the framework. Solid and React carry TanStack Table and Kobalte or Radix; weft's table is 120 hand-written
  lines and its menus are native `popover`, with no arrow keys or typeahead.
- Style is equal once the CSS is: 3–4 ms in all four. warp's 28 ms is warp, not weft.
- warp costs weft 34 KB, 68 ms of first paint and 208 elements at 20 rows.
- Size gaps stay fixed as the app grows: each stack adds about 0.1 KB br per screen.

## Why warp has more elements

At 20 rows warp has 528 elements and weft without warp 320.

The Columns panel now mounts on first open and the phone sort bar only below 600 px of table width, which took warp from 617 to
528 elements, 252 to 227 comments and 1710 to 1479 CDP nodes. Style on load stayed at 28 ms and first paint at about 150 ms: those
elements were `display: none`, so they cost almost no style work. The closed account menu remains, about 15 elements.

| Elements | Where | Why |
|---:|---|---|
| about 110 | Chrome | Icon svgs, sort icons, buttons with wrappers, account menu, skip link |
| 6 per row | Rows | Styled checkbox (5 against 1) and svg chevron (3 against 1) |

warp's phone sort bar had never shown: its `display: none` came after the `@container` rule at equal specificity. It shows now.
warp's remaining style cost is its rule count and the elements on screen, so cutting more hidden nodes won't reduce it.

## Limits

- warp and `shared/design.css` are not equal designs: warp adds dials, sticky pinned columns, focus and contrast work the shared sheet lacks.
- weft without warp has less behaviour in its menus and drawer than Radix or Kobalte.
- Client-only build: none of the stacks is server-rendered here.
- A real React app usually adds a router and data layer. None is counted for any stack.
- Compressed repeats make the sweep a floor: screens were generated, not written by people.

## Purge

`weft/vite` now drops CSS no build file can reach (`packages/weft/node/purge.mjs`). This dashboard: 23.3 → 19.2 KB br (18%).
v3 shop: 15.6 → 12.7 KB. All 27 components on a page: 26.8 → 23.4 KB. Splitting `:where()` for the style fix below adds 0.3–0.4 KB,
so this page is now 26.3 JS + 23.8 CSS = 50.1 KB, just over the 50 KB ceiling (it was 49.7).
Most of warp's CSS was already tree-shaken per component, so what remains is mainly tokens and rules the page uses.

## Rows and Zustand

| Rows on the page | weft, no warp | Solid + Kobalte | React + Radix | React + Zustand | weft + warp | React + MUI |
|---:|---:|---:|---:|---:|---:|---:|
| Elements, 20 → 200 | 320 → 2480 | 337 → 2857 | 295 → 2455 | 295 → 2455 | 528 → 3768 | 569 → 2009 at 100 |
| Load CPU ms, 20 → 200 | 55 → 98 | 96 → 198 | 131 → 209 | 145 → 211 | 117 → 227 | 411 → 570 at 100 |
| Live cell ms, 20 → 200 | 2 → 5 | 4 → 27 | 9 → 33 | 9 → 34 | 4 → 6 | 74 → 235 at 100 |
| Live cell DOM, 20 → 200 | 3 → 3 | 40 → 400 | 3 → 3 | 3 → 3 | 3 → 3 | 131 → 611 at 100 |
| Select ms, 20 → 200 | 3 → 3 | 8 → 15 | 16 → 35 | 13 → 32 | 13 → 18 | 110 → 274 at 100 |
| Sort ms, 20 → 200 | 9 → 25 | 20 → 34 | 19 → 56 | 19 → 56 | 21 → 91 | 56 → 131 at 100 |

- Fine-grained updates hold: live cell stays flat in both weft stacks as rows grow, and select does too.
- warp's 18 elements per row against 12 means load and sort cost more per row; weft without warp has the same 12 as React and
  is the fastest stack at 200 rows on load, live, select and sort.
- Zustand adds 0.1 KB and changes no DOM count: TanStack still owns the table state, so its value isn't visible on this screen.

## Style cost

Solid still wins first paint, on style recalculation: 4 ms against 30. The cause was not tokens or `:has()`. Browsers file a rule
by its last compound, and a complex `:where(A B)` can't be filed, so it was tested against every element. `purge` now rewrites
it to the equivalent `:where(A) :where(B)` in production builds, which is filed under `B`.

| weft + warp, 200 rows | Before | After |
|---|---:|---:|
| Style on load | 49 ms | 30 ms |
| First contentful paint | 184 ms | 160 ms |
| All main-thread work on load | 206 ms | 189 ms |
| Load CPU | 357 ms | 236 ms |
| Sort | 205 ms | 93 ms |
| Select | 30 ms | 17 ms |
| Elements | 4657 | 3857 |
| Comment anchors | 1732 | 1332 |
| CSS br | 19.2 KB | 19.5 KB |

Other changes: a universal `tbody tr > *` became `td` and `th`, `:lang()` sits behind `:where([lang])`, `pin()` returns early with no
pinned cells, the shell and floating labels measure less on mount, and row checkboxes drop the sweep (22 to 18 elements per row).
Select-all keeps the sweep.

What remains: `[data-motion="reduce"] *` is still universal, and the 6.6 comment anchors per row come from the compiler. Before
figures are from the previous run of the same script, so trust the direction more than single milliseconds.
