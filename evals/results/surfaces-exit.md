# Surfaces exit check

2026-10-30: **PASS**. `create-weft --ui warp`, then a fresh agent given one line, from the app and its docs:

> Add an animated starfield to the home page, with a slider that sets how dense it is.

Then the hidden checks in `evals/surfaces-exit.mjs`, against `weft build` + `weft start` in Chrome.

| Check | Result | Detail |
|---|---|---|
| the server renders a sized host and no canvas | pass |  |
| the canvas is named, or decorative | pass | Animated starfield |
| it paints stars | pass | {"colours":272,"lit":2868} |
| it animates | pass |  |
| there is a slider, with a name | pass |  |
| the slider changes the density | pass | 1884 → 6713 lit pixels |
| moving it touches nothing in the surface: the same canvas, 0 DOM writes | pass | {"mutations":0,"same":true} |
| no errors or warnings in the console | pass |  |

- `weft check`: no errors ({"files":4,"tests":0,"errors":0,"warnings":0,"byCode":{}}).
- `tsc` on the app: 0 error(s) in `src/`, 9 in linked packages.
- `weft build`: ok.
- Surface kind the agent chose: canvas2d.
