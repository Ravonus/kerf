# Stack comparison (2026-10-30)

The tables below cover the first four stacks. `compare.html` charts all of them from the latest run; the section on rows and
first paint adds React + Zustand and scale.

From `evals/compare` (see its README; raw numbers in `results.json`). One screen, a shell and a 200-row table, one data set,
latest stable versions, plain `vite build`. The same nine-step script passed on all four. Timing is headless Chromium under 4x
CPU throttle, median of five, on a machine at load ~20, so trust the order more than the milliseconds.

| | weft + warp | Solid + Kobalte | React + Radix | React + MUI |
|---|---:|---:|---:|---:|
| JS br | 20.7 KB | 47.7 KB | 98.5 KB | 239.6 KB |
| CSS br | 19.5 KB | 2.5 KB | 2.5 KB | in the JS |
| **JS + CSS br** | **40.2 KB** | **50.2 KB** | **101.0 KB** | **239.6 KB** |
| JS + CSS gz | 46.5 KB | 56.6 KB | 116.8 KB | 290.5 KB |
| JS raw (what the CPU parses) | 75 KB | 176 KB | 370 KB | 974 KB |
| Script on load | 69 ms | 73 ms | 114 ms | 331 ms |
| Style recalculation on load | 30 ms | 4 ms | 4 ms | 13 ms |
| All main-thread work on load | 189 ms | 145 ms | 184 ms | 440 ms |
| First contentful paint | 160 ms | 132 ms | 184 ms | 428 ms |
| JS heap | 3.2 MB | 3.8 MB | 4.4 MB | 10.9 MB |
| DOM nodes (CDP) | 1710 | 617 | 508 | 765 |
| App source lines | 44 | 124 | 135 | 90 |

DOM mutations per interaction:

| | weft + warp | Solid + Kobalte | React + Radix | React + MUI |
|---|---:|---:|---:|---:|
| Live cell | 3 | 40 | 3 | 131 |
| Sort | 39 | 46 | 60 | 57 |
| Next page | 43 | 43 | 65 | 68 |
| Filter | 57 | 46 | 73 | 132 |
| Select row | 6 | 5 | 6 | 171 |
| Details open | 19 | 3 | 5 | 148 |
| Column picker | 9 | 55 | 54 | 305 |
| Account menu | 5 | 25 | 26 | 147 |

JS + CSS br as the app grows (each screen has its own columns, words, state and markup, sharing the stack's table):

| Screens | weft + warp | Solid + Kobalte | React + Radix | React + MUI |
|---:|---:|---:|---:|---:|
| 1 | 40.6 KB | 50.5 KB | 101.3 KB | 240.0 KB |
| 10 | 42.4 KB | 52.3 KB | 103.0 KB | 241.6 KB |
| 50 | 47.6 KB | 57.3 KB | 107.6 KB | 246.1 KB |
| 200 | 61.4 KB | 70.3 KB | 119.5 KB | 258.4 KB |

## Reading it

- Size gap is fixed, not proportional: every stack adds about 0.1 KB br per screen, and weft is slightly the most (0.104 vs
  0.089–0.099). The ratio narrows with app size; the KB saved does not.
- Solid is the close one: 20% larger on the wire, and it paints faster here. warp's CSS is the difference.
- warp costs more DOM: 617 elements and 252 comment anchors against Radix's 295 elements. See the section below for what
  that does and doesn't cost.
- A live cell is where the MUI and the Solid + TanStack builds pay: TanStack's row model hands Solid new rows, so `For` rebuilds them.

## Limits

- warp ships more design than the hand-written Tailwind screens: dials, dark theme, phone cards, focus and contrast work. The
  Solid and Radix CSS numbers would grow to match it. MUI's community grid has no detail panel, so details open under the grid.
- Client-only build: none of the stacks is server-rendered here.
- A real React app usually adds a router and data layer. None is counted for any stack.
- Compressed repeats make the sweep a floor: screens were generated, not written by people.

## Purge

`weft/vite` now drops CSS no build file can reach (`packages/weft/node/purge.mjs`). This dashboard: 23.3 → 19.2 KB br (18%).
v3 shop: 15.6 → 12.7 KB. All 27 components on a page: 26.8 → 23.4 KB. Splitting `:where()` for the style fix below adds 0.3–0.4 KB,
so this page is now 26.3 JS + 23.8 CSS = 50.1 KB, just over the 50 KB ceiling (it was 49.7).
Most of warp's CSS was already tree-shaken per component, so what remains is mainly tokens and rules the page uses.

## Rows, first paint and Zustand

Per row: weft 18 elements and 6.6 comment anchors, Solid 14, React 12, MUI 18.

| Rows on the page | weft + warp | Solid + Kobalte | React + Radix | React + Zustand | React + MUI |
|---:|---:|---:|---:|---:|---:|
| Elements, 20 → 200 | 617 → 3857 | 337 → 2857 | 295 → 2455 | 295 → 2455 | 569 → 2009 at 100 |
| Load CPU ms, 20 → 200 | 126 → 236 | 109 → 199 | 137 → 214 | 140 → 216 | 396 → 501 at 100 |
| Live cell ms, 20 → 200 | 3 → 6 | 4 → 24 | 10 → 33 | 9 → 36 | 69 → 225 at 100 |
| Live cell DOM, 20 → 200 | 3 → 3 | 40 → 400 | 3 → 3 | 3 → 3 | 131 → 611 at 100 |
| Select ms, 20 → 200 | 17 → 17 | 5 → 10 | 10 → 34 | 12 → 32 | 110 → 257 at 100 |
| Sort ms, 20 → 200 | 23 → 93 | 19 → 31 | 18 → 51 | 17 → 50 | 63 → 134 at 100 |

- More nodes pay off in one place: fine-grained updates. Live cell and select stay flat as rows grow, where React walks the list
  and Solid + TanStack rebuilds rows. Load and sort still cost more per row than the React and Solid stacks.
- Zustand adds 0.3 KB and changes no DOM count: TanStack still owns the table state, so its value isn't visible on this screen.
  It would show across many subscribers, which this dashboard doesn't have.

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
