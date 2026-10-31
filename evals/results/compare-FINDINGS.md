# Same dashboard, four stacks (2026-10-30)

From `evals/compare` (see its README; raw numbers in `results.json`). One screen, a shell and a 200-row table, one data set,
latest stable versions, plain `vite build`. The same nine-step script passed on all four. Timing is headless Chromium under 4x
CPU throttle, median of five, on a machine at load ~20, so trust the order more than the milliseconds.

| | weft + warp | Solid + Kobalte | React + Radix | React + MUI |
|---|---:|---:|---:|---:|
| JS br | 20.6 KB | 47.6 KB | 98.5 KB | 239.6 KB |
| CSS br | 19.2 KB | 2.5 KB | 2.5 KB | in the JS |
| **JS + CSS br** | **39.8 KB** | **50.1 KB** | **101.0 KB** | **239.6 KB** |
| JS + CSS gz | 45.8 KB | 56.6 KB | 116.8 KB | 290.5 KB |
| JS raw (what the CPU parses) | 74 KB | 175 KB | 370 KB | 974 KB |
| Script on load | 68 ms | 73 ms | 119 ms | 341 ms |
| All main-thread work on load | 199 ms | 148 ms | 191 ms | 450 ms |
| First contentful paint | 176 ms | 132 ms | 192 ms | 440 ms |
| JS heap | 3.3 MB | 3.8 MB | 4.4 MB | 10.9 MB |
| DOM nodes (CDP) | 1865 | 617 | 508 | 765 |
| App source lines | 44 | 124 | 135 | 90 |

DOM mutations per interaction:

| | weft + warp | Solid + Kobalte | React + Radix | React + MUI |
|---|---:|---:|---:|---:|
| Live cell | 3 | 40 | 3 | 131 |
| Sort | 39 | 46 | 60 | 57 |
| Next page | 43 | 43 | 65 | 68 |
| Filter | 57 | 46 | 73 | 130 |
| Select row | 8 | 5 | 6 | 171 |
| Details open | 20 | 3 | 5 | 148 |
| Column picker | 11 | 69 | 72 | 323 |
| Account menu | 5 | 25 | 26 | 147 |

JS + CSS br as the app grows (each screen has its own columns, words, state and markup, sharing the stack's table):

| Screens | weft + warp | Solid + Kobalte | React + Radix | React + MUI |
|---:|---:|---:|---:|---:|
| 1 | 40.2 KB | 50.4 KB | 101.3 KB | 240.1 KB |
| 10 | 41.9 KB | 52.2 KB | 103.0 KB | 241.7 KB |
| 50 | 47.2 KB | 57.3 KB | 107.6 KB | 246.0 KB |
| 200 | 60.9 KB | 70.2 KB | 119.6 KB | 257.9 KB |

## Reading it

- Size gap is fixed, not proportional: every stack adds about 0.1 KB br per screen, and weft is slightly the most (0.104 vs
  0.089–0.099). The ratio narrows with app size; the KB saved does not.
- Solid is the close one: 20% larger on the wire, and it paints faster here. warp's CSS is the difference.
- warp costs more DOM: 615 elements and 292 comment anchors against Radix's 295 elements. That is why weft does the most
  main-thread work among the three small stacks despite running the least script.
- A live cell is where the MUI and the Solid + TanStack builds pay: TanStack's row model hands Solid new rows, so `For` rebuilds them.

## Limits

- warp ships more design than the hand-written Tailwind screens: dials, dark theme, phone cards, focus and contrast work. The
  Solid and Radix CSS numbers would grow to match it. MUI's community grid has no detail panel, so details open under the grid.
- Client-only build: none of the stacks is server-rendered here.
- A real React app usually adds a router and data layer. None is counted for any stack.
- Compressed repeats make the sweep a floor: screens were generated, not written by people.

## Purge

`weft/vite` now drops CSS no build file can reach (`packages/weft/node/purge.mjs`). This dashboard: 23.3 → 19.2 KB br (18%).
v3 shop: 15.6 → 12.7 KB. All 27 components on a page: 26.8 → 23.4 KB, which brings JS + CSS under the 50 KB ceiling at 49.7 KB.
Most of warp's CSS was already tree-shaken per component, so what remains is mainly tokens and rules the page uses.
