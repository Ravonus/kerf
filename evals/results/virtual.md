# Virtual collections (2026-10-30)

`packages/warp/scripts/virtual.mjs` drives the real components in a browser with 10,000 items; raw numbers are in
`virtual.json`. It ran in Chromium with the text engine, in WebKit, and in Chromium with the engine blocked. All three passed.
Firefox was not run.

| Chromium, 10,000 items | first row | nodes at rest | worst jump | blank frames | slow frames | rows mispredicted |
|---|---:|---:|---:|---:|---:|---:|
| VirtualList | 133 ms | 51 | 0 px | 0 | 0 | 0 |
| Thread | 143 ms | 98 | 0 px | 0 | 0 | 0 |
| Feed | 81 ms | 106 | 0 px | 0 | 0 | 0 |
| Kanban | 88 ms | 130 | 0.06 px | 0 | 0 | 2 |
| ScrollGrid, 120 columns | 41 ms | 347 | 0 px | 0 | 0 | 0 |
| ScrollGrid, wrapped cells | 70 ms | 170 | 0 px | 0 | 4 | 0 |

Each view scrolled 300 frames down, flung 200 frames, then scrolled 300 frames up. A jump is how far a row that stayed on screen
moved against the scroll. A slow frame is one that missed its budget.

Other checks in the same run:

- Appending to a 10,000-message thread writes 4 DOM nodes.
- A width change rewrites the window once (34 writes for 29 rows) and takes 11 ms. Heights of all 10,000 are re-derived in slices.
- Rows prepended above the viewport shift what's on screen by 0.13 px.
- The grid's arrow keys reach cell 10,000 × 120 with one active cell, and the active row stays mounted.
- With the engine blocked, rows are sized when they render and what's on screen still doesn't jump. Only the scrollbar's estimate
  is worse.

## Against the other stacks

`evals/compare` long list: 10,000 mixed-height rows, under 4x CPU throttle. The machine was busy (load about 25-60), so the load row is rough.
weft + warp uses `VirtualList`; the others use their usual library (TanStack Virtual for Solid, Radix and Zustand, react-virtuoso
for MUI) and weft without warp uses `virtualizer()` measuring from the DOM.

| | weft, no warp | Solid | React + Radix | React + Zustand | weft + warp | React + MUI |
|---|---:|---:|---:|---:|---:|---:|
| Page weight fetched, br | 5.3 KB | 15.4 KB | 67.8 KB | 68.0 KB | 21.9 KB | 76.0 KB |
| Load | 84 ms | 97 ms | 131 ms | 133 ms | 811 ms | 362 ms |
| Total height moved while scrolling | 6,566 px | 6,607 px | 6,607 px | 6,607 px | 0 px | 6,651 px |
| Worst visible jump | 0 | 0 | 0 | 0 | 0 | 0 |

- What exact heights buy is a scrollbar that's right from the first frame: total height never moves, where every estimating
  stack corrected it by about 6,600 px.
- They don't buy fewer visible jumps. All six hold the screen still, so warp has no advantage there.
- They cost load. weft + warp is the slowest here, because it loads the engine and prepares the window's text before the first
  exact paint; the 21.9 KB includes the engine. An app that doesn't need the exact scrollbar can leave `text` off and take the
  measured path.

## Known limits

- Two of the thousands of kanban cards seen mispredict by one line (for example "about loam home opal then sage" in Inter 500 at
  14px), most likely the engine summing segments where the browser shapes the whole line. They correct when rendered, without a
  visible jump. The harness allows up to 1% of rows.
- Not tested: iOS momentum scrolling while `scrollTop` is corrected.
- Not built: Ctrl+F across rows that aren't rendered; Thread quotes, reactions and attachments; Kanban swimlanes, the 4px
  placeholder and Space to pick up.
